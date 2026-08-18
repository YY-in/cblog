import sys
import os

# 将项目根目录添加到 python path 中，使得可以正常导入 app.py 以及读取静态/模板目录
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

class VercelPathMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # 临时调试：无条件输出 WSGI 环境变量
        status = '200 OK'
        headers = [('Content-Type', 'application/json; charset=utf-8')]
        start_response(status, headers)
        import json
        debug_data = {k: str(v) for k, v in environ.items()}
        return [json.dumps(debug_data, indent=2).encode('utf-8')]

# 应用中间件
app.wsgi_app = VercelPathMiddleware(app.wsgi_app)
