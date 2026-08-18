import sys
import os

# 将项目根目录添加到 python path 中，使得可以正常导入 app.py 以及读取静态/模板目录
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
