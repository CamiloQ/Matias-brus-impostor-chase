import unittest
import asyncio
import json
import sys
import os
import importlib.util

server_dir = os.path.dirname(os.path.abspath(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

spec = importlib.util.spec_from_file_location("chase_server", os.path.join(server_dir, "server.py"))
srv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(srv)


class DummyWriter:
    def __init__(self):
        self.sent_messages = []
        self.closed = False

    def write(self, data):
        self.sent_messages.append(data)

    async def drain(self):
        pass

    def close(self):
        self.closed = True

    async def wait_closed(self):
        pass


class TestServerJoin(unittest.IsolatedAsyncioTestCase):
    async def test_join_room_creates_player_and_responds(self):
        srv.ROOMS.clear()
        srv.CONNECTIONS.clear()

        writer = DummyWriter()
        srv.CONNECTIONS[writer] = {"id": "conn_1", "player_id": "conn_1", "room_id": None}

        sent_payloads = []
        original_send_json = srv.send_json

        async def mock_send_json(w, data_dict):
            if w == writer:
                sent_payloads.append(data_dict)

        srv.send_json = mock_send_json
        try:
            msg = json.dumps({
                "type": "join_room",
                "room_id": "TEST_ROOM",
                "name": "Matias",
                "gender": "boy",
                "character": "matias"
            })
            await srv.handle_ws_message(writer, msg)

            self.assertGreaterEqual(len(sent_payloads), 1, "Should have sent joined_room message")
            joined_msg = sent_payloads[0]
            self.assertEqual(joined_msg["type"], "joined_room")
            self.assertIsNotNone(joined_msg.get("player"))
            self.assertEqual(joined_msg["player"]["name"], "Matias")
            self.assertEqual(joined_msg["player"]["character"], "matias")

            broadcast_msg = sent_payloads[1]
            self.assertEqual(broadcast_msg["type"], "player_joined")
            self.assertEqual(broadcast_msg["player"]["id"], "conn_1")
        finally:
            srv.send_json = original_send_json

    async def test_start_game_flow(self):
        srv.ROOMS.clear()
        srv.CONNECTIONS.clear()

        writer = DummyWriter()
        srv.CONNECTIONS[writer] = {"id": "conn_1", "player_id": "conn_1", "room_id": None}

        sent_payloads = []
        original_send_json = srv.send_json

        async def mock_send_json(w, data_dict):
            if w == writer:
                sent_payloads.append(data_dict)

        srv.send_json = mock_send_json
        try:
            # First join
            await srv.handle_ws_message(writer, json.dumps({
                "type": "join_room",
                "room_id": "TEST_ROOM",
                "name": "Matias",
                "gender": "boy",
                "character": "matias"
            }))

            # Now start game
            await srv.handle_ws_message(writer, json.dumps({"type": "start_game"}))

            types = [p["type"] for p in sent_payloads]
            self.assertIn("game_started", types, "start_game must broadcast game_started to writer")
        finally:
            srv.send_json = original_send_json


if __name__ == "__main__":
    unittest.main()
