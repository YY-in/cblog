import sys
import os

# 将项目根目录添加到 python path 中，使得可以正常导入 app.py 以及读取静态/模板目录
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

class VercelPathMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # 包装 start_response，向所有响应（包括 404 页面）注入调试 Header
        def custom_start_response(status, headers, exc_info=None):
            debug_keys = [
                'PATH_INFO', 'SCRIPT_NAME', 'REQUEST_URI', 
                'HTTP_X_FORWARDED_URI', 'HTTP_X_FORWARDED_PATH',
                'HTTP_X_MATCHED_PATH', 'QUERY_STRING'
            ]
            for key in debug_keys:
                val = environ.get(key)
                if val is not None:
                    # 将 _ 替换为 - 以符合 HTTP Header 规范
                    headers.append((f'X-Debug-{key.replace("_", "-")}', str(val)))
            return start_response(status, headers, exc_info)

        # 剥离查询参数获取路径并重载 PATH_INFO
        forwarded_uri = environ.get('HTTP_X_FORWARDED_URI') or environ.get('HTTP_X_MATCHED_PATH')
        if forwarded_uri:
            path = forwarded_uri.split('?')[0]
            environ['PATH_INFO'] = path
        
        environ['SCRIPT_NAME'] = ''
        return self.wsgi_app(environ, custom_start_response)

# 应用中间件
app.wsgi_app = VercelPathMiddleware(app.wsgi_app)
