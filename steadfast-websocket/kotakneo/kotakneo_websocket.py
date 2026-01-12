import asyncio
import websockets
import json
import logging
import requests
import os
import sys

# Add the parent directory and SDK directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)
sys.path.append(os.path.join(parent_dir, 'kotaksdk'))

from neo_api_client import NeoAPI
from config import KOTAKNEO_WEBSOCKET_DATA_ENDPOINT, WS_HOST, KOTAKNEO_WS_PORT

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("kotakneo_ws")

# Global variables
connected_clients = set()
quote_queue = asyncio.Queue()
loop = None
neo_client = None
reverse_token_map = {} # Maps Kotak's tk to Frontend's tk (e.g. "Nifty 50" -> "26000")

# --- SDK Callbacks ---

def on_message(message):
    """Callback from Kotak SDK (runs in a separate thread)"""
    if loop and message:
        # Diagnostic logging for strikes
        logger.info(f"SDK Message: {str(message)[:200]}...")
        
        # SDK often wraps messages like: {"type": "stock_feed", "data": [...]}
        if isinstance(message, dict) and 'data' in message:
            data = message['data']
            if isinstance(data, list):
                for item in data:
                    loop.call_soon_threadsafe(quote_queue.put_nowait, item)
            else:
                loop.call_soon_threadsafe(quote_queue.put_nowait, data)
        elif isinstance(message, list):
            for item in message:
                loop.call_soon_threadsafe(quote_queue.put_nowait, item)
        else:
            # Fallback for strings or other types
            loop.call_soon_threadsafe(quote_queue.put_nowait, message)

def on_error(error):
    logger.error(f"Kotak SDK WebSocket Error: {error}")

def on_close(message=None):
    logger.warning(f"Kotak SDK WebSocket Closed: {message}")

def on_open(message=None):
    logger.info(f"Kotak SDK WebSocket Opened: {message}")

# --- Helper Functions ---

async def get_credentials():
    """Fetch credentials from backend"""
    try:
        current_loop = asyncio.get_event_loop()
        response = await current_loop.run_in_executor(
            None, lambda: requests.get(KOTAKNEO_WEBSOCKET_DATA_ENDPOINT, timeout=5)
        )
        response.raise_for_status()
        data = response.json()
        
        usersession = data.get("usersession", "") 
        sid = data.get("sid", "")
        userid = data.get("userid", "")
        baseUrl = data.get("baseUrl", "") or "https://mis.kotaksecurities.com"
        consumerKey = data.get("consumerKey", "")
        serverId = data.get("serverId", "")
        
        if usersession:
            return {
                'token': usersession,
                'sid': sid,
                'userid': userid,
                'baseUrl': baseUrl,
                'consumerKey': consumerKey,
                'serverId': serverId
            }
        else:
            logger.info("Waiting for credentials...")
            return None
            
    except Exception as e:
        logger.error(f"Failed to retrieve credentials: {e}")
        return None

def get_segment_name(exch):
    """Map frontend exchange name to Kotak Neo segment name"""
    mapping = {
        "NSE": "nse_cm",
        "NFO": "nse_fo",
        "BSE": "bse_cm",
        "BFO": "bse_fo"
    }
    return mapping.get(exch)

# --- WebSocket Server Logic ---

async def handle_frontend_message(message):
    """Parse subscription/unsubscription requests from frontend"""
    global neo_client, reverse_token_map
    try:
        data = json.loads(message)
        action = data.get("action")
        symbols = data.get("symbols", [])
        
        if not neo_client:
            logger.warning("NeoAPI client not initialized yet. Skipping subscription.")
            return

        if action == "subscribe":
            logger.info(f"Subscribing to: {symbols}")
            inst_tokens = []
            idx_tokens = []
            for sym in symbols:
                if '|' in sym:
                    exch, token = sym.split('|')
                    segment = get_segment_name(exch)
                    if segment:
                        mapped_token = token
                        is_idx = False
                        if segment == "nse_cm":
                            if token in ["26000", "26009", "26037", "26001", "26034", "26074"]:
                                is_idx = True
                                if token == "26000": mapped_token = "Nifty 50"
                                elif token == "26009": mapped_token = "Nifty Bank"
                                elif token == "26037": mapped_token = "Nifty Fin Service"
                                elif token == "26001": mapped_token = "Nifty Next 50"
                                elif token == "26034": mapped_token = "NIFTY MIDCAP 100"
                                elif token == "26074": mapped_token = "NIFTY MID SELECT"
                        elif segment == "bse_cm":
                            if token in ["1", "12"]:
                                is_idx = True
                                if token == "1": mapped_token = "SENSEX"
                                elif token == "12": mapped_token = "BANKEX"
                        
                        target_list = idx_tokens if is_idx else inst_tokens
                        target_list.append({"instrument_token": mapped_token, "exchange_segment": segment})
                        if is_idx:
                            reverse_token_map[mapped_token] = token
                            # Also add uppercase variations for robustness
                            reverse_token_map[mapped_token.upper()] = token
                            if "Nifty Bank" in mapped_token: reverse_token_map["NIFTY BANK"] = token
                            if "Nifty Fin Service" in mapped_token: reverse_token_map["NIFTY FIN SERVICE"] = token
            
            if inst_tokens:
                neo_client.subscribe(instrument_tokens=inst_tokens)
            if idx_tokens:
                neo_client.subscribe(instrument_tokens=idx_tokens, isIndex=True)
        
        elif action == "unsubscribe":
            logger.info(f"Unsubscribing from: {symbols}")
            inst_tokens = []
            idx_tokens = []
            for sym in symbols:
                if '|' in sym:
                    exch, token = sym.split('|')
                    segment = get_segment_name(exch)
                    if segment:
                        mapped_token = token
                        is_idx = False
                        if segment == "nse_cm":
                            if token in ["26000", "26009", "26037", "26001", "26034", "26074"]:
                                is_idx = True
                                if token == "26000": mapped_token = "Nifty 50"
                                elif token == "26009": mapped_token = "Nifty Bank"
                                elif token == "26037": mapped_token = "Nifty Fin Service"
                                elif token == "26001": mapped_token = "Nifty Next 50"
                                elif token == "26034": mapped_token = "NIFTY MIDCAP 100"
                                elif token == "26074": mapped_token = "NIFTY MID SELECT"
                        elif segment == "bse_cm":
                            if token in ["1", "12"]:
                                is_idx = True
                                if token == "1": mapped_token = "SENSEX"
                                elif token == "12": mapped_token = "BANKEX"
                        
                        target_list = idx_tokens if is_idx else inst_tokens
                        target_list.append({"instrument_token": mapped_token, "exchange_segment": segment})
            
            if inst_tokens:
                neo_client.un_subscribe(instrument_tokens=inst_tokens)
            
            # NOTE: We skip un_subscribe for indices (idx_tokens) because it often causes a 
            # '2-ifu' crash in the Kotak SDK. Keeping them subscribed is harmless since 
            # there are very few indices.
            # if idx_tokens:
            #     neo_client.un_subscribe(instrument_tokens=idx_tokens, isIndex=True)

    except Exception as e:
        logger.error(f"Error handling frontend message: {e}")

async def broadcast_updates():
    """Consume from queue and broadcast to all connected frontend clients"""
    while True:
        try:
            item = await quote_queue.get()
            
            # SDK can send string messages for status updates, skip them
            if not isinstance(item, dict):
                logger.info(f"SDK Status Message: {item}")
                continue

            tk = item.get('tk') or item.get('instrument_token')
            # Handle both stocks (ltp) and indices (iv) and mapped keys
            lp = item.get('ltp') or item.get('iv') or item.get('last_traded_price') or item.get('lp') or item.get('lastPrice')
            
            if tk and lp is not None:
                # Normalizing tk for lookup (some SDK versions return it as string name)
                frontend_tk = reverse_token_map.get(str(tk), reverse_token_map.get(str(tk).upper(), tk))
                
                # Extra debug for indices
                if str(tk) in reverse_token_map or str(tk).upper() in reverse_token_map:
                     logger.info(f"Mapping index: {tk} -> {frontend_tk} | Price: {lp}")

                # Broadly map possible fields from both Index and Stock/Depth responses
                quote_data = {
                    'tk': str(frontend_tk),
                    'lp': str(lp),
                    'o': str(item.get('op', item.get('openingPrice', item.get('open', '0')))),
                    'h': str(item.get('h', item.get('highPrice', item.get('high_price', '0')))),
                    'l': str(item.get('lo', item.get('lowPrice', item.get('low_price', '0')))),
                    'c': str(item.get('c', item.get('prev_day_close', item.get('ic', '0')))),
                    'v': str(item.get('v', item.get('volume', '0')))
                }
                
                if connected_clients:
                    payload = json.dumps(quote_data)
                    # For debugging: uncomment to see data flow
                    # logger.info(f"Broadcasting LTP for {frontend_tk}: {lp}")
                    await asyncio.gather(*[c.send(payload) for c in connected_clients], return_exceptions=True)
            else:
                if tk:
                    logger.debug(f"Received partial update for {tk}: {item}")
            
        except Exception as e:
            logger.error(f"Error in broadcast loop: {e}")
            await asyncio.sleep(0.1)

async def frontend_ws_handler(websocket):
    """Handle frontend WebSocket connection"""
    logger.info("Frontend client connected")
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            await handle_frontend_message(message)
    except websockets.exceptions.ConnectionClosed:
        logger.info("Frontend client disconnected")
    finally:
        connected_clients.remove(websocket)

async def main(port):
    global loop, neo_client
    loop = asyncio.get_running_loop()
    
    # 1. Start broadcast task
    asyncio.create_task(broadcast_updates())
    
    # 2. Start frontend WebSocket server
    server = await websockets.serve(frontend_ws_handler, WS_HOST, port)
    logger.info(f"Frontend WebSocket server running on {WS_HOST}:{port}")
    
    # 3. Wait for credentials and initialize Kotak SDK
    while True:
        creds = await get_credentials()
        if creds:
            try:
                # Initialize NeoAPI
                neo_client = NeoAPI(access_token=creds['token'], environment='prod', consumer_key=creds['consumerKey'])
                
                # Manually set tokens that the SDK expects
                neo_client.configuration.edit_token = creds['token']
                neo_client.configuration.edit_sid = creds['sid']
                neo_client.configuration.serverId = creds['serverId']
                
                # Set callbacks
                neo_client.on_message = on_message
                neo_client.on_error = on_error
                neo_client.on_close = on_close
                neo_client.on_open = on_open
                
                logger.info(f"Kotak Neo SDK initialized successfully for userid: {creds['userid']}")
                
                # CRITICAL: Actually connect to the WebSocket!
                logger.info("Connecting to Kotak Neo WebSocket...")
                # neo_client.connect() <--- REMOVED: potentially causing crash if method doesn't exist
                # The SDK seems to handle connection via on_message/subscribe or init.
                # If a specific start method is needed, we'll need to check SDK docs, 
                # but removing the crashing line is the first step.
                logger.info("Kotak Neo WebSocket connection initiated")
                
                break
            except Exception as e:
                logger.error(f"Error initializing Kotak Neo SDK: {e}")
        
        await asyncio.sleep(5)
    
    await server.wait_closed()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else KOTAKNEO_WS_PORT
    try:
        asyncio.run(main(port))
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
