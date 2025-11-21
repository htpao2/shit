use serde_json::{Value, json};
use windows::core::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::Win32::UI::Input::KeyboardAndMouse::*;
use std::thread;
use std::time::Duration;

// Helper to parse [x, y] from Value
fn parse_loc(val: &Value, key: &str) -> std::result::Result<(i32, i32), String> {
    let arr = val.get(key)
        .ok_or(format!("Missing '{}' parameter", key))?
        .as_array()
        .ok_or(format!("'{}' must be an array", key))?;
    if arr.len() != 2 {
        return Err(format!("'{}' must have 2 elements", key));
    }
    let x = arr[0].as_i64().ok_or("x must be integer".to_string())? as i32;
    let y = arr[1].as_i64().ok_or("y must be integer".to_string())? as i32;
    Ok((x, y))
}

pub fn move_tool(params: &Value) -> crate::OutputData {
    let loc = match parse_loc(params, "to_loc") {
        Ok(l) => l,
        Err(_) => match parse_loc(params, "loc") {
             Ok(l) => l,
             Err(e) => return crate::OutputData::error(e),
        }
    };

    unsafe {
        SetCursorPos(loc.0, loc.1).ok();
    }
    crate::OutputData::success(json!(format!("Moved the mouse pointer to ({},{}).", loc.0, loc.1)))
}

pub fn click_tool(params: &Value) -> crate::OutputData {
    let loc = match parse_loc(params, "loc") {
        Ok(l) => l,
        Err(e) => return crate::OutputData::error(e),
    };
    let button = params.get("button").and_then(|v| v.as_str()).unwrap_or("left");
    let clicks = params.get("clicks").and_then(|v| v.as_i64()).unwrap_or(1);

    unsafe {
        SetCursorPos(loc.0, loc.1).ok();

        let (down_flag, up_flag) = match button {
            "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        };

        for _ in 0..clicks {
            send_mouse_input(down_flag);
            send_mouse_input(up_flag);
            if clicks > 1 {
                thread::sleep(Duration::from_millis(100));
            }
        }
    }

    crate::OutputData::success(json!(format!("{} {} clicked at ({},{}).", clicks, button, loc.0, loc.1)))
}

pub fn drag_tool(params: &Value) -> crate::OutputData {
    let from = match parse_loc(params, "from_loc") {
        Ok(l) => l,
        Err(e) => return crate::OutputData::error(e),
    };
    let to = match parse_loc(params, "to_loc") {
        Ok(l) => l,
        Err(e) => return crate::OutputData::error(e),
    };

    unsafe {
        SetCursorPos(from.0, from.1).ok();
        thread::sleep(Duration::from_millis(100));
        send_mouse_input(MOUSEEVENTF_LEFTDOWN);
        thread::sleep(Duration::from_millis(200));

        let steps = 20;
        for i in 1..=steps {
            let x = from.0 + (to.0 - from.0) * i / steps;
            let y = from.1 + (to.1 - from.1) * i / steps;
            SetCursorPos(x, y).ok();
            thread::sleep(Duration::from_millis(20));
        }
        SetCursorPos(to.0, to.1).ok();

        send_mouse_input(MOUSEEVENTF_LEFTUP);
    }

    crate::OutputData::success(json!(format!("Dragged from ({},{}) to ({},{}).", from.0, from.1, to.0, to.1)))
}

pub fn scroll_tool(params: &Value) -> crate::OutputData {
    let direction = params.get("direction").and_then(|v| v.as_str()).unwrap_or("");
    let amount = params.get("amount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

    if direction != "up" && direction != "down" {
         return crate::OutputData::error("Invalid direction. Use 'up' or 'down'.".to_string());
    }

    let scroll_amount = if direction == "up" { amount } else { -amount };

    unsafe {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: scroll_amount as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }

    crate::OutputData::success(json!(format!("Scrolled {} by {}.", direction, amount)))
}

pub fn type_tool(params: &Value) -> crate::OutputData {
    let text = match params.get("text").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return crate::OutputData::error("Missing 'text' parameter".to_string()),
    };

    if let Ok(loc) = parse_loc(params, "loc") {
        unsafe {
            SetCursorPos(loc.0, loc.1).ok();
            send_mouse_input(MOUSEEVENTF_LEFTDOWN);
            send_mouse_input(MOUSEEVENTF_LEFTUP);
            thread::sleep(Duration::from_millis(100));
        }
    }

    if params.get("clear").and_then(|v| v.as_bool()).unwrap_or(false) {
        unsafe {
             send_key_input(VK_CONTROL, true);
             send_key_input(VK_A, true);
             send_key_input(VK_A, false);
             send_key_input(VK_CONTROL, false);
             send_key_input(VK_BACK, true);
             send_key_input(VK_BACK, false);
        }
        thread::sleep(Duration::from_millis(50));
    }

    for c in text.chars() {
        unsafe {
             send_unicode_input(c);
        }
        thread::sleep(Duration::from_millis(10));
    }

    crate::OutputData::success(json!(format!("Typed \"{}\".", text)))
}

pub fn key_tool(params: &Value) -> crate::OutputData {
    let key = match params.get("key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => return crate::OutputData::error("Missing 'key'".to_string()),
    };

    if let Some(vk) = map_key_to_vk(key) {
         unsafe {
             send_key_input(vk, true);
             send_key_input(vk, false);
         }
         crate::OutputData::success(json!(format!("Pressed key {}.", key)))
    } else {
        crate::OutputData::error(format!("Unknown key: {}", key))
    }
}

pub fn shortcut_tool(params: &Value) -> crate::OutputData {
    let shortcut = match params.get("shortcut").and_then(|v| v.as_array()) {
        Some(s) => s,
        None => return crate::OutputData::error("Missing 'shortcut' array".to_string()),
    };

    let mut vks = Vec::new();
    for k in shortcut {
        if let Some(key_str) = k.as_str() {
            if let Some(vk) = map_key_to_vk(key_str) {
                vks.push(vk);
            } else {
                return crate::OutputData::error(format!("Unknown key in shortcut: {}", key_str));
            }
        }
    }

    unsafe {
        for &vk in &vks {
            send_key_input(vk, true);
        }
        for &vk in vks.iter().rev() {
            send_key_input(vk, false);
        }
    }

    crate::OutputData::success(json!(format!("Pressed shortcut {:?}.", shortcut)))
}


unsafe fn send_mouse_input(flags: MOUSE_EVENT_FLAGS) {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
}

unsafe fn send_key_input(vk: VIRTUAL_KEY, down: bool) {
    let dw_flags = if down { KEYBD_EVENT_FLAGS(0) } else { KEYEVENTF_KEYUP };
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: dw_flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
}

unsafe fn send_unicode_input(c: char) {
    let mut buf = [0; 2];
    let chars = c.encode_utf16(&mut buf);

    for code in chars {
        let input_down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: *code,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let input_up = INPUT {
             r#type: INPUT_KEYBOARD,
             Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: *code,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[input_down, input_up], std::mem::size_of::<INPUT>() as i32);
    }
}


fn map_key_to_vk(key: &str) -> Option<VIRTUAL_KEY> {
    match key.to_lowercase().as_str() {
        "enter" => Some(VK_RETURN),
        "ctrl" | "control" => Some(VK_CONTROL),
        "shift" => Some(VK_SHIFT),
        "alt" => Some(VK_MENU),
        "tab" => Some(VK_TAB),
        "esc" | "escape" => Some(VK_ESCAPE),
        "space" => Some(VK_SPACE),
        "backspace" => Some(VK_BACK),
        "delete" => Some(VK_DELETE),
        "up" => Some(VK_UP),
        "down" => Some(VK_DOWN),
        "left" => Some(VK_LEFT),
        "right" => Some(VK_RIGHT),
        "home" => Some(VK_HOME),
        "end" => Some(VK_END),
        "pageup" => Some(VK_PRIOR),
        "pagedown" => Some(VK_NEXT),
        "win" | "windows" => Some(VK_LWIN),
        "cmd" | "command" => Some(VK_LWIN),
        "a" => Some(VK_A),
        "b" => Some(VK_B),
        "c" => Some(VK_C),
        "d" => Some(VK_D),
        "e" => Some(VK_E),
        "f" => Some(VK_F),
        "g" => Some(VK_G),
        "h" => Some(VK_H),
        "i" => Some(VK_I),
        "j" => Some(VK_J),
        "k" => Some(VK_K),
        "l" => Some(VK_L),
        "m" => Some(VK_M),
        "n" => Some(VK_N),
        "o" => Some(VK_O),
        "p" => Some(VK_P),
        "q" => Some(VK_Q),
        "r" => Some(VK_R),
        "s" => Some(VK_S),
        "t" => Some(VK_T),
        "u" => Some(VK_U),
        "v" => Some(VK_V),
        "w" => Some(VK_W),
        "x" => Some(VK_X),
        "y" => Some(VK_Y),
        "z" => Some(VK_Z),
        "0" => Some(VK_0),
        "1" => Some(VK_1),
        "2" => Some(VK_2),
        "3" => Some(VK_3),
        "4" => Some(VK_4),
        "5" => Some(VK_5),
        "6" => Some(VK_6),
        "7" => Some(VK_7),
        "8" => Some(VK_8),
        "9" => Some(VK_9),
        "f1" => Some(VK_F1),
        "f2" => Some(VK_F2),
        "f3" => Some(VK_F3),
        "f4" => Some(VK_F4),
        "f5" => Some(VK_F5),
        "f6" => Some(VK_F6),
        "f7" => Some(VK_F7),
        "f8" => Some(VK_F8),
        "f9" => Some(VK_F9),
        "f10" => Some(VK_F10),
        "f11" => Some(VK_F11),
        "f12" => Some(VK_F12),
        _ => None,
    }
}
