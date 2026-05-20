FROM python:3.11-slim

WORKDIR /app

# 禁用 Python 缓存机制，确保日志实时输出
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装基础编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# 复制依赖并安装（额外安装生产级 WSGI 服务器 gunicorn）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn

# 复制其余源码
COPY . .

EXPOSE 5000

# 生产环境使用 Gunicorn 启动
CMD ["gunicorn", "--workers", "3", "--bind", "0.0.0.0:5000", "app:app"]
