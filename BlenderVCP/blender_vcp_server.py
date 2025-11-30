#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BlenderVCP - VCP Plugin for Blender Control

This script implements a VCP (Virtual Cherry-Var Protocol) synchronous plugin
that connects to the Blender addon socket server and executes commands.

Based on BlenderMCP by Siddharth Ahuja (https://github.com/ahujasid)
Converted to VCP protocol for VCPToolBox integration.
"""

import sys
import json
import socket
import os
import tempfile
import base64
import logging

# Configure logging to stderr (stdout is reserved for VCP responses)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger("BlenderVCP")

# Default configuration
DEFAULT_HOST = "localhost"
DEFAULT_PORT = 9876


class BlenderConnection:
    """Manages socket connection to the Blender addon"""
    
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.sock = None
    
    def connect(self) -> bool:
        """Connect to the Blender addon socket server"""
        if self.sock:
            return True
        
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.connect((self.host, self.port))
            logger.info(f"Connected to Blender at {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Blender: {str(e)}")
            self.sock = None
            return False
    
    def disconnect(self):
        """Disconnect from the Blender addon"""
        if self.sock:
            try:
                self.sock.close()
            except Exception as e:
                logger.error(f"Error disconnecting from Blender: {str(e)}")
            finally:
                self.sock = None
    
    def receive_full_response(self, buffer_size: int = 8192) -> bytes:
        """Receive the complete response, potentially in multiple chunks"""
        chunks = []
        self.sock.settimeout(180.0)  # Match the addon's timeout
        
        try:
            while True:
                try:
                    chunk = self.sock.recv(buffer_size)
                    if not chunk:
                        if not chunks:
                            raise Exception("Connection closed before receiving any data")
                        break
                    
                    chunks.append(chunk)
                    
                    # Check if we've received a complete JSON object
                    try:
                        data = b''.join(chunks)
                        json.loads(data.decode('utf-8'))
                        logger.info(f"Received complete response ({len(data)} bytes)")
                        return data
                    except json.JSONDecodeError:
                        continue
                except socket.timeout:
                    logger.warning("Socket timeout during chunked receive")
                    break
                except (ConnectionError, BrokenPipeError, ConnectionResetError) as e:
                    logger.error(f"Socket connection error during receive: {str(e)}")
                    raise
        except socket.timeout:
            logger.warning("Socket timeout during chunked receive")
        except Exception as e:
            logger.error(f"Error during receive: {str(e)}")
            raise
        
        if chunks:
            data = b''.join(chunks)
            logger.info(f"Returning data after receive completion ({len(data)} bytes)")
            try:
                json.loads(data.decode('utf-8'))
                return data
            except json.JSONDecodeError:
                raise Exception("Incomplete JSON response received")
        else:
            raise Exception("No data received")
    
    def send_command(self, command_type: str, params: dict = None) -> dict:
        """Send a command to Blender and return the response"""
        if not self.sock and not self.connect():
            raise ConnectionError("Not connected to Blender")
        
        command = {
            "type": command_type,
            "params": params or {}
        }
        
        try:
            logger.info(f"Sending command: {command_type} with params: {params}")
            self.sock.sendall(json.dumps(command).encode('utf-8'))
            logger.info(f"Command sent, waiting for response...")
            
            self.sock.settimeout(180.0)
            response_data = self.receive_full_response()
            logger.info(f"Received {len(response_data)} bytes of data")
            
            response = json.loads(response_data.decode('utf-8'))
            logger.info(f"Response parsed, status: {response.get('status', 'unknown')}")
            
            if response.get("status") == "error":
                logger.error(f"Blender error: {response.get('message')}")
                raise Exception(response.get("message", "Unknown error from Blender"))
            
            return response.get("result", {})
        except socket.timeout:
            logger.error("Socket timeout while waiting for response from Blender")
            self.sock = None
            raise Exception("Timeout waiting for Blender response - try simplifying your request")
        except (ConnectionError, BrokenPipeError, ConnectionResetError) as e:
            logger.error(f"Socket connection error: {str(e)}")
            self.sock = None
            raise Exception(f"Connection to Blender lost: {str(e)}")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response from Blender: {str(e)}")
            raise Exception(f"Invalid response from Blender: {str(e)}")
        except Exception as e:
            logger.error(f"Error communicating with Blender: {str(e)}")
            self.sock = None
            raise Exception(f"Communication error with Blender: {str(e)}")


# Global connection instance
_blender_connection = None


def get_blender_connection() -> BlenderConnection:
    """Get or create a persistent Blender connection"""
    global _blender_connection
    
    if _blender_connection is not None:
        try:
            # Test connection by getting polyhaven status
            _blender_connection.send_command("get_polyhaven_status")
            return _blender_connection
        except Exception as e:
            logger.warning(f"Existing connection is no longer valid: {str(e)}")
            try:
                _blender_connection.disconnect()
            except:
                pass
            _blender_connection = None
    
    if _blender_connection is None:
        host = os.getenv("BLENDER_HOST", DEFAULT_HOST)
        port = int(os.getenv("BLENDER_PORT", DEFAULT_PORT))
        _blender_connection = BlenderConnection(host=host, port=port)
        if not _blender_connection.connect():
            logger.error("Failed to connect to Blender")
            _blender_connection = None
            raise Exception("Could not connect to Blender. Make sure the Blender addon is running.")
        logger.info("Created new persistent connection to Blender")
    
    return _blender_connection


# Command handlers

def handle_get_scene_info(args: dict) -> dict:
    """Get detailed information about the current Blender scene"""
    blender = get_blender_connection()
    result = blender.send_command("get_scene_info")
    return {"status": "success", "result": json.dumps(result, indent=2, ensure_ascii=False)}


def handle_get_object_info(args: dict) -> dict:
    """Get detailed information about a specific object"""
    object_name = args.get("object_name") or args.get("name")
    if not object_name:
        return {"status": "error", "error": "Missing required parameter: object_name"}
    
    blender = get_blender_connection()
    result = blender.send_command("get_object_info", {"name": object_name})
    return {"status": "success", "result": json.dumps(result, indent=2, ensure_ascii=False)}


def handle_get_viewport_screenshot(args: dict) -> dict:
    """Capture a screenshot of the current Blender 3D viewport"""
    max_size = int(args.get("max_size", 800))
    
    blender = get_blender_connection()
    
    # Create temp file path
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"blender_screenshot_{os.getpid()}.png")
    
    result = blender.send_command("get_viewport_screenshot", {
        "max_size": max_size,
        "filepath": temp_path,
        "format": "png"
    })
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    if not os.path.exists(temp_path):
        return {"status": "error", "error": "Screenshot file was not created"}
    
    # Read and encode the file
    with open(temp_path, 'rb') as f:
        image_bytes = f.read()
    
    # Delete the temp file
    os.remove(temp_path)
    
    # Return as multimodal response
    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    return {
        "status": "success",
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": f"Blender 视口截图已成功捕获 ({result.get('width', 'unknown')}x{result.get('height', 'unknown')} 像素)"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{base64_image}"
                    }
                }
            ]
        }
    }


def handle_execute_blender_code(args: dict) -> dict:
    """Execute arbitrary Python code in Blender"""
    code = args.get("code")
    if not code:
        return {"status": "error", "error": "Missing required parameter: code"}
    
    blender = get_blender_connection()
    result = blender.send_command("execute_code", {"code": code})
    return {"status": "success", "result": f"代码执行成功: {result.get('result', '')}"}


def handle_get_polyhaven_status(args: dict) -> dict:
    """Check if PolyHaven integration is enabled"""
    blender = get_blender_connection()
    result = blender.send_command("get_polyhaven_status")
    enabled = result.get("enabled", False)
    message = result.get("message", "")
    if enabled:
        message += " PolyHaven 擅长纹理，比 Sketchfab 有更多种类的纹理。"
    return {"status": "success", "result": message}


def handle_get_polyhaven_categories(args: dict) -> dict:
    """Get categories for a specific asset type on Polyhaven"""
    asset_type = args.get("asset_type", "hdris")
    
    blender = get_blender_connection()
    result = blender.send_command("get_polyhaven_categories", {"asset_type": asset_type})
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    categories = result.get("categories", {})
    formatted_output = f"{asset_type} 的类别:\n\n"
    sorted_categories = sorted(categories.items(), key=lambda x: x[1], reverse=True)
    for category, count in sorted_categories:
        formatted_output += f"- {category}: {count} 个资产\n"
    
    return {"status": "success", "result": formatted_output}


def handle_search_polyhaven_assets(args: dict) -> dict:
    """Search for assets on Polyhaven"""
    asset_type = args.get("asset_type", "all")
    categories = args.get("categories")
    
    blender = get_blender_connection()
    result = blender.send_command("search_polyhaven_assets", {
        "asset_type": asset_type,
        "categories": categories
    })
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    assets = result.get("assets", {})
    total_count = result.get("total_count", 0)
    returned_count = result.get("returned_count", 0)
    
    formatted_output = f"找到 {total_count} 个资产"
    if categories:
        formatted_output += f"，类别: {categories}"
    formatted_output += f"\n显示 {returned_count} 个资产:\n\n"
    
    sorted_assets = sorted(assets.items(), key=lambda x: x[1].get("download_count", 0), reverse=True)
    for asset_id, asset_data in sorted_assets:
        asset_types = ['HDRI', 'Texture', 'Model']
        asset_type_index = asset_data.get('type', 0)
        formatted_output += f"- {asset_data.get('name', asset_id)} (ID: {asset_id})\n"
        formatted_output += f"  类型: {asset_types[asset_type_index] if asset_type_index < len(asset_types) else 'Unknown'}\n"
        formatted_output += f"  类别: {', '.join(asset_data.get('categories', []))}\n"
        formatted_output += f"  下载量: {asset_data.get('download_count', 'Unknown')}\n\n"
    
    return {"status": "success", "result": formatted_output}


def handle_download_polyhaven_asset(args: dict) -> dict:
    """Download and import a Polyhaven asset into Blender"""
    asset_id = args.get("asset_id")
    asset_type = args.get("asset_type")
    resolution = args.get("resolution", "1k")
    file_format = args.get("file_format")
    
    if not asset_id or not asset_type:
        return {"status": "error", "error": "Missing required parameters: asset_id and asset_type"}
    
    blender = get_blender_connection()
    result = blender.send_command("download_polyhaven_asset", {
        "asset_id": asset_id,
        "asset_type": asset_type,
        "resolution": resolution,
        "file_format": file_format
    })
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    if result.get("success"):
        message = result.get("message", "资产下载并导入成功")
        if asset_type == "hdris":
            return {"status": "success", "result": f"{message}。HDRI 已设置为世界环境。"}
        elif asset_type == "textures":
            material_name = result.get("material", "")
            maps = ", ".join(result.get("maps", []))
            return {"status": "success", "result": f"{message}。创建了材质 '{material_name}'，包含贴图: {maps}。"}
        elif asset_type == "models":
            return {"status": "success", "result": f"{message}。模型已导入到当前场景。"}
        else:
            return {"status": "success", "result": message}
    else:
        return {"status": "error", "error": f"下载资产失败: {result.get('message', 'Unknown error')}"}


def handle_set_texture(args: dict) -> dict:
    """Apply a previously downloaded Polyhaven texture to an object"""
    object_name = args.get("object_name")
    texture_id = args.get("texture_id")
    
    if not object_name or not texture_id:
        return {"status": "error", "error": "Missing required parameters: object_name and texture_id"}
    
    blender = get_blender_connection()
    result = blender.send_command("set_texture", {
        "object_name": object_name,
        "texture_id": texture_id
    })
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    if result.get("success"):
        material_name = result.get("material", "")
        maps = ", ".join(result.get("maps", []))
        return {"status": "success", "result": f"成功将纹理 '{texture_id}' 应用到 {object_name}。使用材质 '{material_name}'，包含贴图: {maps}。"}
    else:
        return {"status": "error", "error": f"应用纹理失败: {result.get('message', 'Unknown error')}"}


def handle_get_sketchfab_status(args: dict) -> dict:
    """Check if Sketchfab integration is enabled"""
    blender = get_blender_connection()
    result = blender.send_command("get_sketchfab_status")
    enabled = result.get("enabled", False)
    message = result.get("message", "")
    if enabled:
        message += " Sketchfab 擅长逼真模型，比 PolyHaven 有更多种类的模型。"
    return {"status": "success", "result": message}


def handle_search_sketchfab_models(args: dict) -> dict:
    """Search for models on Sketchfab"""
    query = args.get("query")
    if not query:
        return {"status": "error", "error": "Missing required parameter: query"}
    
    categories = args.get("categories")
    count = int(args.get("count", 20))
    downloadable = args.get("downloadable", True)
    if isinstance(downloadable, str):
        downloadable = downloadable.lower() in ("true", "1", "yes")
    
    blender = get_blender_connection()
    result = blender.send_command("search_sketchfab_models", {
        "query": query,
        "categories": categories,
        "count": count,
        "downloadable": downloadable
    })
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    models = result.get("results", []) or []
    if not models:
        return {"status": "success", "result": f"没有找到匹配 '{query}' 的模型"}
    
    formatted_output = f"找到 {len(models)} 个匹配 '{query}' 的模型:\n\n"
    for model in models:
        if model is None:
            continue
        model_name = model.get("name", "Unnamed model")
        model_uid = model.get("uid", "Unknown ID")
        formatted_output += f"- {model_name} (UID: {model_uid})\n"
        
        user = model.get("user") or {}
        username = user.get("username", "Unknown author") if isinstance(user, dict) else "Unknown author"
        formatted_output += f"  作者: {username}\n"
        
        license_data = model.get("license") or {}
        license_label = license_data.get("label", "Unknown") if isinstance(license_data, dict) else "Unknown"
        formatted_output += f"  许可证: {license_label}\n"
        
        face_count = model.get("faceCount", "Unknown")
        is_downloadable = "是" if model.get("isDownloadable") else "否"
        formatted_output += f"  面数: {face_count}\n"
        formatted_output += f"  可下载: {is_downloadable}\n\n"
    
    return {"status": "success", "result": formatted_output}


def handle_download_sketchfab_model(args: dict) -> dict:
    """Download and import a Sketchfab model by its UID"""
    uid = args.get("uid")
    if not uid:
        return {"status": "error", "error": "Missing required parameter: uid"}
    
    blender = get_blender_connection()
    result = blender.send_command("download_sketchfab_model", {"uid": uid})
    
    if result is None:
        return {"status": "error", "error": "Received no response from Sketchfab download request"}
    
    if "error" in result:
        return {"status": "error", "error": result["error"]}
    
    if result.get("success"):
        imported_objects = result.get("imported_objects", [])
        object_names = ", ".join(imported_objects) if imported_objects else "none"
        return {"status": "success", "result": f"成功导入模型。创建的对象: {object_names}"}
    else:
        return {"status": "error", "error": f"下载模型失败: {result.get('message', 'Unknown error')}"}


def handle_get_hyper3d_status(args: dict) -> dict:
    """Check if Hyper3D Rodin integration is enabled"""
    blender = get_blender_connection()
    result = blender.send_command("get_hyper3d_status")
    return {"status": "success", "result": result.get("message", "")}


def handle_generate_hyper3d_model_via_text(args: dict) -> dict:
    """Generate 3D asset using Hyper3D by text description"""
    text_prompt = args.get("text_prompt")
    if not text_prompt:
        return {"status": "error", "error": "Missing required parameter: text_prompt"}
    
    bbox_condition = args.get("bbox_condition")
    if bbox_condition and isinstance(bbox_condition, str):
        try:
            bbox_condition = json.loads(bbox_condition)
        except:
            bbox_condition = None
    
    blender = get_blender_connection()
    result = blender.send_command("create_rodin_job", {
        "text_prompt": text_prompt,
        "images": None,
        "bbox_condition": bbox_condition
    })
    
    succeed = result.get("submit_time", False)
    if succeed:
        return {
            "status": "success",
            "result": json.dumps({
                "task_uuid": result.get("uuid"),
                "subscription_key": result.get("jobs", {}).get("subscription_key"),
                "message": "3D 模型生成任务已提交。请使用 PollRodinJobStatus 检查任务状态。"
            }, ensure_ascii=False)
        }
    else:
        return {"status": "success", "result": json.dumps(result, ensure_ascii=False)}


def handle_generate_hyper3d_model_via_images(args: dict) -> dict:
    """Generate 3D asset using Hyper3D by images"""
    input_image_paths = args.get("input_image_paths")
    input_image_urls = args.get("input_image_urls")
    bbox_condition = args.get("bbox_condition")
    
    if input_image_paths and isinstance(input_image_paths, str):
        try:
            input_image_paths = json.loads(input_image_paths)
        except:
            pass
    
    if input_image_urls and isinstance(input_image_urls, str):
        try:
            input_image_urls = json.loads(input_image_urls)
        except:
            pass
    
    if bbox_condition and isinstance(bbox_condition, str):
        try:
            bbox_condition = json.loads(bbox_condition)
        except:
            bbox_condition = None
    
    if input_image_paths is not None and input_image_urls is not None:
        return {"status": "error", "error": "Conflict parameters given!"}
    if input_image_paths is None and input_image_urls is None:
        return {"status": "error", "error": "No image given!"}
    
    images = None
    if input_image_paths is not None:
        images = []
        for path in input_image_paths:
            if not os.path.exists(path):
                return {"status": "error", "error": f"Image path not found: {path}"}
            with open(path, "rb") as f:
                ext = os.path.splitext(path)[1]
                images.append((ext, base64.b64encode(f.read()).decode("ascii")))
    elif input_image_urls is not None:
        images = input_image_urls.copy()
    
    blender = get_blender_connection()
    result = blender.send_command("create_rodin_job", {
        "text_prompt": None,
        "images": images,
        "bbox_condition": bbox_condition
    })
    
    succeed = result.get("submit_time", False)
    if succeed:
        return {
            "status": "success",
            "result": json.dumps({
                "task_uuid": result.get("uuid"),
                "subscription_key": result.get("jobs", {}).get("subscription_key"),
                "message": "3D 模型生成任务已提交。请使用 PollRodinJobStatus 检查任务状态。"
            }, ensure_ascii=False)
        }
    else:
        return {"status": "success", "result": json.dumps(result, ensure_ascii=False)}


def handle_poll_rodin_job_status(args: dict) -> dict:
    """Check if the Hyper3D Rodin generation task is completed"""
    subscription_key = args.get("subscription_key")
    request_id = args.get("request_id")
    
    kwargs = {}
    if subscription_key:
        kwargs["subscription_key"] = subscription_key
    elif request_id:
        kwargs["request_id"] = request_id
    else:
        return {"status": "error", "error": "Missing required parameter: subscription_key or request_id"}
    
    blender = get_blender_connection()
    result = blender.send_command("poll_rodin_job_status", kwargs)
    return {"status": "success", "result": json.dumps(result, ensure_ascii=False)}


def handle_import_generated_asset(args: dict) -> dict:
    """Import the asset generated by Hyper3D Rodin"""
    name = args.get("name")
    if not name:
        return {"status": "error", "error": "Missing required parameter: name"}
    
    task_uuid = args.get("task_uuid")
    request_id = args.get("request_id")
    
    kwargs = {"name": name}
    if task_uuid:
        kwargs["task_uuid"] = task_uuid
    elif request_id:
        kwargs["request_id"] = request_id
    else:
        return {"status": "error", "error": "Missing required parameter: task_uuid or request_id"}
    
    blender = get_blender_connection()
    result = blender.send_command("import_generated_asset", kwargs)
    
    if result.get("succeed"):
        return {
            "status": "success",
            "result": f"成功导入生成的资产 '{result.get('name', name)}'。\n" +
                      f"位置: {result.get('location', [])}\n" +
                      f"旋转: {result.get('rotation', [])}\n" +
                      f"缩放: {result.get('scale', [])}\n" +
                      f"边界框: {result.get('world_bounding_box', [])}"
        }
    else:
        return {"status": "error", "error": result.get("error", "导入失败")}


def handle_get_hunyuan3d_status(args: dict) -> dict:
    """Check if Hunyuan3D integration is enabled"""
    blender = get_blender_connection()
    result = blender.send_command("get_hunyuan3d_status")
    return {"status": "success", "result": result.get("message", "")}


def handle_generate_hunyuan3d_model(args: dict) -> dict:
    """Generate 3D asset using Hunyuan3D"""
    text_prompt = args.get("text_prompt")
    input_image_url = args.get("input_image_url")
    
    blender = get_blender_connection()
    result = blender.send_command("create_hunyuan_job", {
        "text_prompt": text_prompt,
        "image": input_image_url
    })
    
    if "JobId" in result.get("Response", {}):
        job_id = result["Response"]["JobId"]
        formatted_job_id = f"job_{job_id}"
        return {
            "status": "success",
            "result": json.dumps({
                "job_id": formatted_job_id,
                "message": "Hunyuan3D 模型生成任务已提交。请使用 PollHunyuanJobStatus 检查任务状态。"
            }, ensure_ascii=False)
        }
    return {"status": "success", "result": json.dumps(result, ensure_ascii=False)}


def handle_poll_hunyuan_job_status(args: dict) -> dict:
    """Check if the Hunyuan3D generation task is completed"""
    job_id = args.get("job_id")
    if not job_id:
        return {"status": "error", "error": "Missing required parameter: job_id"}
    
    blender = get_blender_connection()
    result = blender.send_command("poll_hunyuan_job_status", {"job_id": job_id})
    return {"status": "success", "result": json.dumps(result, ensure_ascii=False)}


def handle_import_generated_asset_hunyuan(args: dict) -> dict:
    """Import the asset generated by Hunyuan3D"""
    name = args.get("name")
    zip_file_url = args.get("zip_file_url")
    
    if not name or not zip_file_url:
        return {"status": "error", "error": "Missing required parameters: name and zip_file_url"}
    
    blender = get_blender_connection()
    result = blender.send_command("import_generated_asset_hunyuan", {
        "name": name,
        "zip_file_url": zip_file_url
    })
    
    if result.get("succeed"):
        return {
            "status": "success",
            "result": f"成功导入 Hunyuan3D 生成的资产 '{result.get('name', name)}'。\n" +
                      f"位置: {result.get('location', [])}\n" +
                      f"旋转: {result.get('rotation', [])}\n" +
                      f"缩放: {result.get('scale', [])}\n" +
                      f"边界框: {result.get('world_bounding_box', [])}"
        }
    else:
        return {"status": "error", "error": result.get("error", "导入失败")}


# Command dispatcher
COMMAND_HANDLERS = {
    "GetSceneInfo": handle_get_scene_info,
    "GetObjectInfo": handle_get_object_info,
    "GetViewportScreenshot": handle_get_viewport_screenshot,
    "ExecuteBlenderCode": handle_execute_blender_code,
    "GetPolyhavenStatus": handle_get_polyhaven_status,
    "GetPolyhavenCategories": handle_get_polyhaven_categories,
    "SearchPolyhavenAssets": handle_search_polyhaven_assets,
    "DownloadPolyhavenAsset": handle_download_polyhaven_asset,
    "SetTexture": handle_set_texture,
    "GetSketchfabStatus": handle_get_sketchfab_status,
    "SearchSketchfabModels": handle_search_sketchfab_models,
    "DownloadSketchfabModel": handle_download_sketchfab_model,
    "GetHyper3dStatus": handle_get_hyper3d_status,
    "GenerateHyper3dModelViaText": handle_generate_hyper3d_model_via_text,
    "GenerateHyper3dModelViaImages": handle_generate_hyper3d_model_via_images,
    "PollRodinJobStatus": handle_poll_rodin_job_status,
    "ImportGeneratedAsset": handle_import_generated_asset,
    "GetHunyuan3dStatus": handle_get_hunyuan3d_status,
    "GenerateHunyuan3dModel": handle_generate_hunyuan3d_model,
    "PollHunyuanJobStatus": handle_poll_hunyuan_job_status,
    "ImportGeneratedAssetHunyuan": handle_import_generated_asset_hunyuan,
}


def process_request(request: dict) -> dict:
    """Process a VCP request and return the response"""
    command = request.get("command")
    
    if not command:
        return {"status": "error", "error": "Missing required parameter: command"}
    
    handler = COMMAND_HANDLERS.get(command)
    if not handler:
        return {"status": "error", "error": f"Unknown command: {command}"}
    
    try:
        return handler(request)
    except Exception as e:
        logger.error(f"Error processing command {command}: {str(e)}")
        return {"status": "error", "error": str(e)}


def main():
    """Main entry point for the VCP plugin"""
    try:
        # Read input from stdin
        input_data = sys.stdin.readline().strip()
        
        if not input_data:
            output = {"status": "error", "error": "No input received"}
            print(json.dumps(output, ensure_ascii=False))
            sys.exit(1)
        
        # Parse input as JSON
        try:
            request = json.loads(input_data)
        except json.JSONDecodeError as e:
            output = {"status": "error", "error": f"Invalid JSON input: {str(e)}"}
            print(json.dumps(output, ensure_ascii=False))
            sys.exit(1)
        
        # Process the request
        response = process_request(request)
        
        # Output the response
        print(json.dumps(response, ensure_ascii=False))
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Fatal error: {str(e)}")
        output = {"status": "error", "error": str(e)}
        print(json.dumps(output, ensure_ascii=False))
        sys.exit(1)
    finally:
        # Clean up connection
        global _blender_connection
        if _blender_connection:
            _blender_connection.disconnect()


if __name__ == "__main__":
    main()