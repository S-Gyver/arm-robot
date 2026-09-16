import http.server
import socketserver
import os

PORT = 3000
web_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(web_dir)

Handler = http.server.SimpleHTTPRequestHandler

httpd = socketserver.TCPServer(("", PORT), Handler)
print("Robot Arm Web Server running on port", PORT)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    httpd.server_close()
