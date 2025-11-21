use serde_json::{json, Value};
use windows::core::*;
use windows::Win32::System::Com::*;
use windows::Win32::UI::Accessibility::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::Foundation::*;
use std::ffi::c_void;
use std::mem::size_of;
use base64::{Engine as _, engine::general_purpose};
use image::ImageOutputFormat;
use std::io::Cursor;

// Interactive control types
const INTERACTIVE_TYPES: &[u32] = &[
    UIA_ButtonControlTypeId.0,
    UIA_ListItemControlTypeId.0,
    UIA_MenuItemControlTypeId.0,
    UIA_EditControlTypeId.0,
    UIA_CheckBoxControlTypeId.0,
    UIA_RadioButtonControlTypeId.0,
    UIA_ComboBoxControlTypeId.0,
    UIA_HyperlinkControlTypeId.0,
    UIA_SplitButtonControlTypeId.0,
    UIA_TabItemControlTypeId.0,
    UIA_TreeItemControlTypeId.0,
    UIA_DataItemControlTypeId.0,
    UIA_HeaderItemControlTypeId.0,
    UIA_ImageControlTypeId.0,
    UIA_SpinnerControlTypeId.0,
    UIA_ScrollBarControlTypeId.0,
];

const INFORMATIVE_TYPES: &[u32] = &[
    UIA_TextControlTypeId.0,
    UIA_ImageControlTypeId.0,
];

pub fn get_desktop_info() -> crate::OutputData {
    match get_desktop_state_impl(true) {
        Ok(result) => crate::OutputData::success(result),
        Err(e) => crate::OutputData::error(format!("Failed to get desktop info: {}", e)),
    }
}

pub fn state_tool() -> crate::OutputData {
    match get_desktop_state_text_impl() {
        Ok(text) => crate::OutputData::success(json!(text)),
        Err(e) => crate::OutputData::error(format!("Failed to get desktop state: {}", e)),
    }
}

fn get_desktop_state_impl(include_screenshot: bool) -> Result<Value> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok();
    }

    let automation: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
    let root = unsafe { automation.GetRootElement()? };
    let condition = unsafe { automation.CreateTrueCondition()? };

    let mut apps_data = Vec::new();
    let mut interactive_nodes = Vec::new();
    let mut informative_nodes = Vec::new();

    let element_array = unsafe { root.FindAll(TreeScope_Children, &condition)? };
    let count = unsafe { element_array.Length()? };

    for i in 0..count {
        let el = unsafe { element_array.GetElement(i)? };

        let name = unsafe { el.CurrentName() }.unwrap_or_default().to_string();
        let is_offscreen = unsafe { el.CurrentIsOffscreen() }.unwrap_or(BOOL(1)).as_bool();

        if !is_offscreen && !name.is_empty() && name != "Program Manager" {
            walk_app_children(&automation, &el, &name, &mut interactive_nodes, &mut informative_nodes, 0);

            let rect = unsafe { el.CurrentBoundingRectangle() }.unwrap_or_default();
            apps_data.push(json!({
                "name": name,
                "status": if rect.right - rect.left > 0 { "Normal" } else { "Minimized" },
                "size": format!("({},{})", rect.right - rect.left, rect.bottom - rect.top)
            }));
        }
    }

    let mut details = json!({
        "apps": apps_data,
        "active_app": "Unknown",
        "tree_state": {
             "interactive_elements_to_string": format_interactive(&interactive_nodes),
             "informative_elements_to_string": format_informative(&informative_nodes)
        }
    });

    let mut content_list = Vec::new();

    if include_screenshot {
         if let Ok(b64_img) = capture_screenshot_base64() {
             details.as_object_mut().unwrap().insert("screenshot_base64".to_string(), json!(b64_img));
             content_list.push(json!({
                 "type": "image_url",
                 "image_url": {
                     "url": format!("data:image/png;base64,{}", b64_img)
                 }
             }));
         }
    }

    content_list.push(json!({
        "type": "text",
        "text": "已成功获取桌面信息。"
    }));

    Ok(json!({
        "content": content_list,
        "details": details
    }))
}

fn get_desktop_state_text_impl() -> Result<String> {
     unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok();
    }

    let automation: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
    let root = unsafe { automation.GetRootElement()? };
    let condition = unsafe { automation.CreateTrueCondition()? };

    let mut app_lines = Vec::new();
    let mut interactive_nodes = Vec::new();
    let mut informative_nodes = Vec::new();

    let element_array = unsafe { root.FindAll(TreeScope_Children, &condition)? };
    let count = unsafe { element_array.Length()? };

    for i in 0..count {
         let el = unsafe { element_array.GetElement(i)? };
         let name = unsafe { el.CurrentName() }.unwrap_or_default().to_string();
         let is_offscreen = unsafe { el.CurrentIsOffscreen() }.unwrap_or(BOOL(1)).as_bool();

         if !is_offscreen && !name.is_empty() && name != "Program Manager" {
             let rect = unsafe { el.CurrentBoundingRectangle() }.unwrap_or_default();
             app_lines.push(format!("Name: {}|Depth: 0|Status: Normal|Size: ({},{})", name, rect.right-rect.left, rect.bottom-rect.top));
             walk_app_children(&automation, &el, &name, &mut interactive_nodes, &mut informative_nodes, 0);
         }
    }

    let active_app_str = "No active app";
    let apps_str = if app_lines.is_empty() { "No apps opened".to_string() } else { app_lines.join("\n") };
    let interactive_str = format_interactive(&interactive_nodes);
    let informative_str = format_informative(&informative_nodes);

    Ok(format!("Active App:\n{}\n\nOpened Apps:\n{}\n\nList of Interactive Elements:\n{}\n\nList of Informative Elements:\n{}",
        active_app_str, apps_str, interactive_str, informative_str))
}


struct NodeInfo {
    name: String,
    control_type: String,
    shortcut: String,
    center: (i32, i32),
    app_name: String,
}

fn walk_app_children(
    automation: &IUIAutomation,
    parent: &IUIAutomationElement,
    app_name: &str,
    interactive: &mut Vec<NodeInfo>,
    informative: &mut Vec<NodeInfo>,
    depth: u32
) {
    if depth > 15 { return; }

    let condition = unsafe { automation.CreateTrueCondition().unwrap() };
    let element_array = unsafe { parent.FindAll(TreeScope_Children, &condition) };

    if let Ok(arr) = element_array {
        let count = unsafe { arr.Length().unwrap_or(0) };
        for i in 0..count {
             if let Ok(el) = unsafe { arr.GetElement(i) } {
                let name_res = unsafe { el.CurrentName() };
                let name = name_res.unwrap_or_default().to_string();
                let control_type = unsafe { el.CurrentControlType() }.unwrap_or(UIA_CONTROLTYPE_ID(0)).0;
                let is_enabled = unsafe { el.CurrentIsEnabled() }.unwrap_or(BOOL(0)).as_bool();
                let is_offscreen = unsafe { el.CurrentIsOffscreen() }.unwrap_or(BOOL(1)).as_bool();

                if !is_offscreen && is_enabled {
                     let rect = unsafe { el.CurrentBoundingRectangle() }.unwrap_or_default();
                     let center = ((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
                     let shortcut = unsafe { el.CurrentAcceleratorKey() }.unwrap_or_default().to_string();
                     let localized_type = unsafe { el.CurrentLocalizedControlType() }.unwrap_or_default().to_string();

                     let node = NodeInfo {
                         name: if name.is_empty() { "''".to_string() } else { name },
                         control_type: localized_type,
                         shortcut: if shortcut.is_empty() { "''".to_string() } else { shortcut },
                         center,
                         app_name: app_name.to_string(),
                     };

                     if INTERACTIVE_TYPES.contains(&control_type) {
                         interactive.push(node);
                     } else if INFORMATIVE_TYPES.contains(&control_type) {
                         informative.push(node);
                     }

                     walk_app_children(automation, &el, app_name, interactive, informative, depth + 1);
                }
             }
        }
    }
}

fn format_interactive(nodes: &[NodeInfo]) -> String {
    nodes.iter().enumerate().map(|(i, n)| {
        format!("Label: {} App Name: {} ControlType: {} Control Name: {} Shortcut: {} Cordinates: ({},{})",
            i, n.app_name, n.control_type, n.name, n.shortcut, n.center.0, n.center.1)
    }).collect::<Vec<_>>().join("\n")
}

fn format_informative(nodes: &[NodeInfo]) -> String {
    nodes.iter().enumerate().map(|(i, n)| {
        format!("Label: {} App Name: {} Name: {}", i, n.app_name, n.name)
    }).collect::<Vec<_>>().join("\n")
}


fn capture_screenshot_base64() -> Result<String> {
    unsafe {
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);

        let hdc_screen = GetDC(None);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, screen_w, screen_h);

        let old_obj = SelectObject(hdc_mem, hbitmap);
        // Fix BitBlt return handling
        if BitBlt(hdc_mem, 0, 0, screen_w, screen_h, hdc_screen, 0, 0, SRCCOPY).is_err() {
            return Err(windows::core::Error::from(E_FAIL));
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: screen_w,
                biHeight: -screen_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (screen_w * screen_h * 4) as usize];
        GetDIBits(hdc_mem, hbitmap, 0, screen_h as u32, Some(pixels.as_mut_ptr() as *mut c_void), &mut bmi, DIB_RGB_COLORS);

        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        for chunk in pixels.chunks_exact_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
            chunk[3] = 255;
        }

        let img_buf = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(screen_w as u32, screen_h as u32, pixels).ok_or(windows::core::Error::from(E_FAIL))?;

        let mut cursor = Cursor::new(Vec::new());
        img_buf.write_to(&mut cursor, ImageOutputFormat::Png).map_err(|_| windows::core::Error::from(E_FAIL))?;

        Ok(general_purpose::STANDARD.encode(cursor.into_inner()))
    }
}
