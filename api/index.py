import sys
import os

# 将项目根目录添加到 python path 中，使得可以正常导入 app.py 以及读取静态/模板目录
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

class VercelPathMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # 调试拦截器：直接输出 WSGI 环境变量，绕过 Flask 路由
        if environ.get('PATH_INFO') == '/api-debug-info':
            status = '200 OK'
            headers = [('Content-type', 'application/json; charset=utf-8')]
            start_response(status, headers)
            import json
            # 过滤出可序列化的字符串值
            debug_data = {k: str(v) for k, v in environ.items()}
            return [json.dumps(debug_data, indent=2).encode('utf-8')]

        # Vercel 会通过 HTTP_X_FORWARDED_URI 传递原始请求路径（例如 /about?lang=zh）
        forwarded_uri = environ.get('HTTP_X_FORWARDED_URI') or environ.get('HTTP_X_MATCHED_PATH')
        if forwarded_uri:
            # 剥离查询参数获取路径
            path = forwarded_uri.split('?')[0]
            environ['PATH_INFO'] = path
        
        # 确保 SCRIPT_NAME 为空，这样 url_for 等生成的链接是基于根目录的（例如 /static/...），而不是 /api/index.py/...
        environ['SCRIPT_NAME'] = ''
        return self.wsgi_app(environ, start_response)

# 应用中间件
app.wsgi_app = VercelPathMiddleware(app.wsgi_app)
