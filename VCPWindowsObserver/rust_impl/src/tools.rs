use serde_json::{json, Value};
use std::process::Command;
use std::thread;
use std::time::Duration;
use windows::Win32::System::DataExchange::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Memory::*;
use reqwest::Client;

// CF_UNICODETEXT is u32 in older windows crates but in 0.52 it is likely a const of type u32 or struct?
// In 0.52, it's `pub const CF_UNICODETEXT: u32 = 13u32;` (or similar)
// Wait, SetClipboardData takes u32.
// Check imports. `windows::Win32::System::DataExchange::*` should bring it.
// Maybe I need to verify what `CF_UNICODETEXT` is.
// It's usually `13`.

pub fn launch_tool(params: &Value) -> crate::OutputData {
    let name = match params.get("name").and_then(|v| v.as_str()) {
        Some(n) => n,
        None => return crate::OutputData::error("Missing 'name'".to_string()),
    };

    if Command::new("cmd")
        .args(["/C", "start", "", name])
        .spawn()
        .is_ok()
    {
        return crate::OutputData::success(json!(format!("Launched {}", name)));
    }

    let ps_cmd = format!("Start-Process -FilePath '{}' -PassThru | Out-Null", name);
    match Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_cmd])
        .status()
    {
        Ok(s) if s.success() => crate::OutputData::success(json!(format!("Launched {} via PowerShell", name))),
        _ => crate::OutputData::error(format!("Failed to launch {}", name)),
    }
}

pub fn clipboard_tool(params: &Value) -> crate::OutputData {
    let mode = match params.get("mode").and_then(|v| v.as_str()) {
        Some(m) => m,
        None => return crate::OutputData::error("Missing 'mode'".to_string()),
    };

    if mode == "copy" {
        let text = match params.get("text").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => return crate::OutputData::error("Missing 'text' for copy".to_string()),
        };

        if set_clipboard_text(text).is_ok() {
            crate::OutputData::success(json!(format!("Copied \"{}\" to clipboard", text)))
        } else {
            crate::OutputData::error("Failed to set clipboard".to_string())
        }
    } else if mode == "paste" {
        match get_clipboard_text() {
            Ok(content) => crate::OutputData::success(json!(format!("Clipboard Content: \"{}\"", content))),
            Err(_) => crate::OutputData::error("Failed to get clipboard content".to_string()),
        }
    } else {
        crate::OutputData::error("Invalid mode. Use 'copy' or 'paste'".to_string())
    }
}

fn set_clipboard_text(text: &str) -> Result<(), ()> {
    unsafe {
        if OpenClipboard(None).is_err() { return Err(()); }

        if EmptyClipboard().is_err() {
            let _ = CloseClipboard();
            return Err(());
        }

        let mut utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let size = utf16.len() * 2;

        let h_mem = match GlobalAlloc(GMEM_MOVEABLE, size) {
             Ok(h) => h,
             Err(_) => { let _ = CloseClipboard(); return Err(()); }
        };

        let ptr = GlobalLock(h_mem);
        if !ptr.is_null() {
            std::ptr::copy_nonoverlapping(utf16.as_ptr() as *const u8, ptr as *mut u8, size);
            let _ = GlobalUnlock(h_mem);

            // CF_UNICODETEXT is 13
            if SetClipboardData(13, HANDLE(h_mem.0 as isize)).is_err() {
                 let _ = GlobalFree(h_mem);
                 let _ = CloseClipboard();
                 return Err(());
            }
        } else {
             let _ = GlobalFree(h_mem);
             let _ = CloseClipboard();
             return Err(());
        }

        let _ = CloseClipboard();
        Ok(())
    }
}

fn get_clipboard_text() -> Result<String, ()> {
    unsafe {
        if OpenClipboard(None).is_err() { return Err(()); }

        let h_mem_res = GetClipboardData(13);
        let h_mem = match h_mem_res {
            Ok(h) => h,
            Err(_) => { let _ = CloseClipboard(); return Err(()); }
        };

        let h_global = HGLOBAL(h_mem.0 as *mut std::ffi::c_void);

        let ptr = GlobalLock(h_global);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return Err(());
        }

        let len = GlobalSize(h_global) / 2;
        let slice = std::slice::from_raw_parts(ptr as *const u16, len);

        let real_len = slice.iter().position(|&c| c == 0).unwrap_or(len);
        let s = String::from_utf16_lossy(&slice[..real_len]);

        let _ = GlobalUnlock(h_global);
        let _ = CloseClipboard();
        Ok(s)
    }
}

pub fn wait_tool(params: &Value) -> crate::OutputData {
    let duration = params.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
    thread::sleep(Duration::from_secs_f64(duration));
    crate::OutputData::success(json!(format!("Waited for {} seconds.", duration)))
}

pub async fn scrape_tool(params: &Value) -> crate::OutputData {
    let url = match params.get("url").and_then(|v| v.as_str()) {
        Some(u) => u,
        None => return crate::OutputData::error("Missing 'url'".to_string()),
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    match client.get(url).send().await {
        Ok(resp) => {
             match resp.text().await {
                 Ok(html) => {
                     let content = extract_text_from_html(&html);
                     crate::OutputData::success(json!(format!("Scraped the contents of the entire webpage:\n{}", content)))
                 },
                 Err(e) => crate::OutputData::error(format!("Failed to read response text: {}", e)),
             }
        },
        Err(e) => crate::OutputData::error(format!("Failed to fetch URL: {}", e)),
    }
}

fn extract_text_from_html(html: &str) -> String {
    let document = scraper::Html::parse_document(html);
    let body_selector = scraper::Selector::parse("body").unwrap();

    if let Some(body) = document.select(&body_selector).next() {
        body.text().collect::<Vec<_>>().join(" ")
            .split_whitespace().collect::<Vec<_>>().join(" ")
    } else {
        "No body content found".to_string()
    }
}
