import os
import json
import sys

def get_plugin_details(plugin_dir_path):
    manifest_path = os.path.join(plugin_dir_path, "plugin-manifest.json")
    blocked_manifest_path = os.path.join(plugin_dir_path, "plugin-manifest.json.block")
    
    is_enabled = True
    actual_manifest_path = manifest_path

    if os.path.exists(blocked_manifest_path):
        is_enabled = False
        actual_manifest_path = blocked_manifest_path
    elif not os.path.exists(manifest_path):
        return None # No manifest or blocked manifest found

    try:
        with open(actual_manifest_path, 'r', encoding='utf-8') as f:
            manifest_data = json.load(f)
        
        plugin_info = {
            "name": manifest_data.get("name"),
            "displayName": manifest_data.get("displayName"),
            "version": manifest_data.get("version"),
            "description": manifest_data.get("description"),
            "pluginType": manifest_data.get("pluginType"),
            "enabled": is_enabled,
            "commands": []
        }

                # Populate commands if capabilities.invocationCommands exists, regardless of pluginType.
        if ("capabilities" in manifest_data and 
            manifest_data["capabilities"] and  # Ensure 'capabilities' itself is not null
            "invocationCommands" in manifest_data["capabilities"] and 
            isinstance(manifest_data["capabilities"]["invocationCommands"], list)):
            for cmd in manifest_data["capabilities"]["invocationCommands"]:
                command_info = {"command": cmd.get("command"), "description": cmd.get("description")}
                if cmd.get("example"): # Optionally include example if present
                    command_info["example"] = cmd.get("example")
                plugin_info["commands"].append(command_info)


        return plugin_info
    except Exception as e:
        # Log error to stderr for VCP server to potentially pick up
        print(f"Error parsing manifest for {plugin_dir_path}: {str(e)}", file=sys.stderr)
        return None

def list_all_plugins():
    # Assuming VCPToolBox is the parent directory of the 'Plugin' directory
    # and this script is in VCPToolBox/Plugin/PluginInfoPlugin/main.py
    # So, ../../Plugin/ should be the target plugin directory relative to this script's parent
    base_plugin_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    all_plugins_info = []

    if not os.path.isdir(base_plugin_dir):
        return {"status": "error", "error": f"Plugin directory not found at {base_plugin_dir}"}

    for plugin_name in os.listdir(base_plugin_dir):
        plugin_subdir_path = os.path.join(base_plugin_dir, plugin_name)
        if os.path.isdir(plugin_subdir_path):
            # Skip self (PluginInfoPlugin) to avoid recursion or self-listing if not desired,
            # though listing itself is generally fine. For now, let's list all.
            # if plugin_name == "PluginInfoPlugin":
            #     continue
            details = get_plugin_details(plugin_subdir_path)
            if details:
                all_plugins_info.append(details)
    
    return {"status": "success", "result": json.dumps(all_plugins_info, ensure_ascii=False, indent=2)}

if __name__ == "__main__":
    # This script is called by VCP server via stdio.
    # For this specific plugin, it doesn't need to read any input from stdin for 'list_available_vcp_plugins'
    # input_data = sys.stdin.read() # Not used for this command
    
    # The command is implicitly 'list_available_vcp_plugins' as it's the only one.
    # In a multi-command plugin, you'd parse input_data to determine the command.
    
    output = list_all_plugins()
    print(json.dumps(output)) 