# Local preview server that never lets the browser cache an old version.
import http.server, functools
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()
http.server.ThreadingHTTPServer(("", 8765), functools.partial(NoCache, directory=".")).serve_forever()
