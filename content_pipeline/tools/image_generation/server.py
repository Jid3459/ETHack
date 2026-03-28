from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8080


class Handler(SimpleHTTPRequestHandler):
    pass


def serve_image_server():
    print(f"Serving at http://localhost:{PORT}")
    HTTPServer(("localhost", PORT), Handler).serve_forever()


serve_image_server()
