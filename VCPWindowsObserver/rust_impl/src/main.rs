mod desktop;
mod input;
mod tools;

use std::io::{self, Read, Write};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
struct InputData {
    command: String,
    #[serde(flatten)]
    params: Value,
}

#[derive(Serialize)]
struct OutputData {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl OutputData {
    fn success(result: Value) -> Self {
        Self {
            status: "success".to_string(),
            result: Some(result),
            error: None,
        }
    }

    fn error(msg: String) -> Self {
        Self {
            status: "error".to_string(),
            result: None,
            error: Some(msg),
        }
    }
}

#[tokio::main]
async fn main() {
    let mut buffer = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut buffer) {
        send_response(OutputData::error(format!("Failed to read stdin: {}", e)));
        return;
    }

    let input: InputData = match serde_json::from_str(&buffer) {
        Ok(data) => data,
        Err(e) => {
            send_response(OutputData::error(format!("Invalid JSON input: {}", e)));
            return;
        }
    };

    let result = match input.command.as_str() {
        "get_desktop_info" => desktop::get_desktop_info(),
        "launch_tool" => tools::launch_tool(&input.params),
        "state_tool" => desktop::state_tool(),
        "clipboard_tool" => tools::clipboard_tool(&input.params),
        "click_tool" => input::click_tool(&input.params),
        "type_tool" => input::type_tool(&input.params),
        "scroll_tool" => input::scroll_tool(&input.params),
        "drag_tool" => input::drag_tool(&input.params),
        "move_tool" => input::move_tool(&input.params),
        "shortcut_tool" => input::shortcut_tool(&input.params),
        "key_tool" => input::key_tool(&input.params),
        "wait_tool" => tools::wait_tool(&input.params),
        "scrape_tool" => tools::scrape_tool(&input.params).await,
        _ => OutputData::error(format!("Unknown command: {}", input.command)),
    };

    send_response(result);
}

fn send_response(output: OutputData) {
    let json = serde_json::to_string(&output).unwrap_or_else(|_| r#"{"status":"error","error":"Serialization failed"}"#.to_string());
    let _ = io::stdout().write_all(json.as_bytes());
    let _ = io::stdout().flush();
}
