import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

import copy

import yaml
import markdown
from flask import Flask, render_template, request, jsonify, abort, make_response

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "change-me-in-production")

class VercelPathMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # 包装 start_response，寻找包含 'projects' 的环境变量并输出为 header
        def custom_start_response(status, headers, exc_info=None):
            for k, v in environ.items():
                if 'projects' in str(v):
                    headers.append((f'X-Debug-Found-{k.replace("_", "-")}', str(v)[:100]))
            return start_response(status, headers, exc_info)

        # 1. 尝试从 Vercel 请求头中提取原始路径
        forwarded_uri = environ.get('HTTP_X_FORWARDED_URI') or environ.get('HTTP_X_MATCHED_PATH')
        if forwarded_uri:
            path = forwarded_uri.split('?')[0]
            environ['PATH_INFO'] = path
        else:
            # 2. 备用方案：剥离可能存在的文件名路径前缀（如 /app.py 或 /api/index.py）
            path = environ.get('PATH_INFO', '')
            for prefix in ['/api/index.py', '/api/index', '/app.py', '/app']:
                if path.startswith(prefix):
                    path = path[len(prefix):] or '/'
                    environ['PATH_INFO'] = path
                    break
        
        # 确保 SCRIPT_NAME 为空，使 url_for 生成正确的根相对链接
        environ['SCRIPT_NAME'] = ''
        return self.wsgi_app(environ, custom_start_response)

app.wsgi_app = VercelPathMiddleware(app.wsgi_app)



# ---------------------------------------------------------------------------
# Load YAML config
# ---------------------------------------------------------------------------

def load_config():
    with open(BASE_DIR / "config" / "config.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_lang_config(lang: str):
    """Load language-specific override file (e.g. config/config.zh.yaml)."""
    path = BASE_DIR / "config" / f"config.{lang}.yaml"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into a copy of base."""
    result = copy.deepcopy(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = deep_merge(result[key], val)
        else:
            result[key] = copy.deepcopy(val)
    return result


SUPPORTED_LANGS = ["en", "zh"]
DEFAULT_LANG = "en"

CONFIG = load_config()
LANG_CONFIGS: dict[str, dict] = {}
for _lang in SUPPORTED_LANGS:
    if _lang != DEFAULT_LANG:
        LANG_CONFIGS[_lang] = load_lang_config(_lang)

# Load P5R theme text config (with language support)
def load_p5r_config():
    path = BASE_DIR / "config" / "config.p5r.yaml"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}

def load_p5r_lang_config(lang: str):
    path = BASE_DIR / "config" / f"config.p5r.{lang}.yaml"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}

P5R_CONFIG = load_p5r_config()
P5R_LANG_CONFIGS: dict[str, dict] = {}
for _lang in SUPPORTED_LANGS:
    if _lang != DEFAULT_LANG:
        P5R_LANG_CONFIGS[_lang] = load_p5r_lang_config(_lang)


def get_current_lang() -> str:
    """Determine language from ?lang= param, cookie, or default."""
    lang = request.args.get("lang", "").strip().lower()
    if lang in SUPPORTED_LANGS:
        return lang
    lang = request.cookies.get("lang", "").strip().lower()
    if lang in SUPPORTED_LANGS:
        return lang
    return DEFAULT_LANG


@app.context_processor
def inject_config():
    """Make config available in every template. Reload in debug mode."""
    global CONFIG, LANG_CONFIGS
    if app.debug:
        CONFIG = load_config()
        for _lang in SUPPORTED_LANGS:
            if _lang != DEFAULT_LANG:
                LANG_CONFIGS[_lang] = load_lang_config(_lang)

    lang = get_current_lang()
    if lang != DEFAULT_LANG and lang in LANG_CONFIGS:
        cfg = deep_merge(CONFIG, LANG_CONFIGS[lang])
    else:
        cfg = CONFIG
    # Map request path to nav URL for active tab highlighting
    path = request.path.rstrip("/") or "/"
    url_map = {"/": "/", "/about": "/about", "/projects": "/projects",
               "/skills": "/skills", "/contact": "/contact", "/blog": "/blog"}
    active_url = url_map.get(path, "")
    # Also match sub-paths like /projects/synergy → /projects
    if not active_url:
        for prefix in ["/projects", "/blog"]:
            if path.startswith(prefix):
                active_url = prefix
                break

    global P5R_CONFIG, P5R_LANG_CONFIGS
    if app.debug:
        P5R_CONFIG = load_p5r_config()
        for _lang in SUPPORTED_LANGS:
            if _lang != DEFAULT_LANG:
                P5R_LANG_CONFIGS[_lang] = load_p5r_lang_config(_lang)

    if lang != DEFAULT_LANG and lang in P5R_LANG_CONFIGS:
        p5r = deep_merge(P5R_CONFIG, P5R_LANG_CONFIGS[lang])
    else:
        p5r = P5R_CONFIG

    return {"cfg": cfg, "p5r": p5r, "current_lang": lang,
            "supported_langs": SUPPORTED_LANGS, "active_url": active_url}


@app.after_request
def set_lang_cookie(response):
    """Persist language choice in cookie when ?lang= is used."""
    lang = request.args.get("lang", "").strip().lower()
    if lang in SUPPORTED_LANGS:
        response.set_cookie("lang", lang, max_age=365 * 24 * 3600, samesite="Lax")
    return response


# ---------------------------------------------------------------------------
# Markdown helpers
# ---------------------------------------------------------------------------

MD_EXTENSIONS = ["extra", "codehilite", "meta", "toc", "tables", "fenced_code"]


def _resolve_md_path(folder: str, slug: str, lang: str = None):
    """Return the best .md path for given slug + language.
    Tries <slug>.<lang>.md first, falls back to <slug>.md."""
    content_dir = BASE_DIR / "content" / folder
    if lang and lang != DEFAULT_LANG:
        localized = content_dir / f"{slug}.{lang}.md"
        if localized.exists():
            return localized
    default = content_dir / f"{slug}.md"
    return default if default.exists() else None


def load_markdown(folder: str, slug: str, lang: str = None):
    """Load a .md file with language awareness and return (meta, html)."""
    md_path = _resolve_md_path(folder, slug, lang)
    if md_path is None:
        return None, None
    text = md_path.read_text(encoding="utf-8")
    md = markdown.Markdown(extensions=MD_EXTENSIONS)
    html = md.convert(text)
    meta = {k: v[0] if len(v) == 1 else v for k, v in md.Meta.items()} if hasattr(md, "Meta") else {}
    return meta, html


def list_markdown(folder: str, lang: str = None):
    """List all .md files in content/<folder>/ with language awareness.
    Sorts by 'order' metadata field if present, otherwise by modification time."""
    content_dir = BASE_DIR / "content" / folder
    if not content_dir.exists():
        return []
    # Collect base slugs (exclude lang-suffixed files from slug list)
    slugs_seen = set()
    base_files = []
    for p in content_dir.glob("*.md"):
        stem = p.stem
        # Skip language variants when collecting slugs (e.g. bomb-blind-shot.zh)
        parts = stem.rsplit(".", 1)
        if len(parts) == 2 and parts[1] in SUPPORTED_LANGS:
            base_slug = parts[0]
        else:
            base_slug = stem
        if base_slug not in slugs_seen:
            slugs_seen.add(base_slug)
            base_files.append(base_slug)

    results = []
    for slug in base_files:
        md_path = _resolve_md_path(folder, slug, lang)
        if md_path is None:
            continue
        md_obj = markdown.Markdown(extensions=MD_EXTENSIONS)
        html = md_obj.convert(md_path.read_text(encoding="utf-8"))
        meta = {k: v[0] if len(v) == 1 else v for k, v in md_obj.Meta.items()} if hasattr(md_obj, "Meta") else {}
        results.append({"slug": slug, "meta": meta, "html": html})
    # Sort by order field if present (lower = first)
    results.sort(key=lambda x: int(x["meta"].get("order", 999)))
    return results


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("home.html", active="HOME")


@app.route("/about")
def about():
    return render_template("about.html", active="ABOUT")


@app.route("/projects")
def projects():
    lang = get_current_lang()
    items = list_markdown("projects", lang)
    return render_template("projects.html", active="PROJECTS", projects=items)


@app.route("/projects/<slug>")
def project_detail(slug):
    lang = get_current_lang()
    meta, html = load_markdown("projects", slug, lang)
    if html is None:
        abort(404)
    return render_template("project_detail.html", active="PROJECTS", meta=meta, content=html, slug=slug)


@app.route("/skills")
def skills():
    return render_template("skills.html", active="SKILLS")


@app.route("/blog")
def blog():
    lang = get_current_lang()
    posts = list_markdown("blog", lang)
    return render_template("blog.html", active="BLOG", posts=posts)


@app.route("/blog/<slug>")
def blog_post(slug):
    lang = get_current_lang()
    meta, html = load_markdown("blog", slug, lang)
    if html is None:
        abort(404)
    return render_template("blog_post.html", active="BLOG", meta=meta, content=html)


@app.route("/contact")
def contact():
    return render_template("contact.html", active="CONTACT")


@app.route("/hack")
def hacker_game():
    return render_template("hacker_game.html", active="")


@app.route("/timeline")
def timeline():
    lang = get_current_lang()
    items = list_markdown("projects", lang)
    return render_template("timeline.html", active="PROJECTS", projects=items)


@app.route("/feed.xml")
def rss_feed():
    lang = get_current_lang()
    posts = list_markdown("blog", lang)
    response = make_response(render_template("feed.xml", posts=posts))
    response.headers["Content-Type"] = "application/rss+xml; charset=utf-8"
    return response


@app.route("/sitemap.xml")
def sitemap():
    urls = [
        {"loc": request.url_root, "priority": "1.0"},
        {"loc": request.url_root + "about", "priority": "0.8"},
        {"loc": request.url_root + "projects", "priority": "0.9"},
        {"loc": request.url_root + "skills", "priority": "0.7"},
        {"loc": request.url_root + "contact", "priority": "0.7"},
        {"loc": request.url_root + "blog", "priority": "0.8"},
        {"loc": request.url_root + "timeline", "priority": "0.6"},
        {"loc": request.url_root + "hack", "priority": "0.5"},
    ]
    lang = get_current_lang()
    for p in list_markdown("projects", lang):
        urls.append({"loc": request.url_root + "projects/" + p["slug"], "priority": "0.7"})
    for p in list_markdown("blog", lang):
        urls.append({"loc": request.url_root + "blog/" + p["slug"], "priority": "0.6"})
    response = make_response(render_template("sitemap.xml", urls=urls))
    response.headers["Content-Type"] = "application/xml; charset=utf-8"
    return response


# ---------------------------------------------------------------------------
# Contact form → SMTP
# ---------------------------------------------------------------------------

@app.route("/api/contact", methods=["POST"])
def api_contact():
    data = request.get_json(silent=True) or request.form
    name = data.get("name", "").strip()
    email_addr = data.get("email", "").strip()
    subject = data.get("subject", "GENERAL_SIGNAL").strip()
    message = data.get("message", "").strip()

    if not name or not email_addr or not message:
        return jsonify({"ok": False, "error": "Missing required fields"}), 400

    email_cfg = CONFIG.get("email", {})
    smtp_server = os.environ.get("SMTP_SERVER", email_cfg.get("smtp_server", ""))
    smtp_port = int(os.environ.get("SMTP_PORT", email_cfg.get("smtp_port", 587)))
    smtp_user = os.environ.get("SMTP_USER", email_cfg.get("smtp_user", ""))
    smtp_password = os.environ.get("SMTP_PASSWORD", email_cfg.get("smtp_password", ""))
    recipient = os.environ.get("MAIL_RECIPIENT", email_cfg.get("recipient", ""))
    prefix = email_cfg.get("subject_prefix", "[CONTACT]")

    if not smtp_user or not smtp_password or not recipient:
        return jsonify({"ok": False, "error": "Mail server not configured"}), 500

    msg = MIMEMultipart()
    msg["From"] = smtp_user
    msg["To"] = recipient
    msg["Reply-To"] = email_addr
    msg["Subject"] = f"{prefix} {subject} — from {name}"

    body = f"Name: {name}\nEmail: {email_addr}\nSubject: {subject}\n\n{message}"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
    except Exception as e:
        app.logger.error("SMTP error: %s", e)
        return jsonify({"ok": False, "error": "Failed to send message"}), 500

    return jsonify({"ok": True, "message": "TRANSMISSION_SUCCESS"})


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def page_not_found(e):
    return render_template("404.html"), 404


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000,
            extra_files=[str(BASE_DIR / "config" / "config.yaml"),
                         str(BASE_DIR / "config" / "config.zh.yaml"),
                         str(BASE_DIR / "config" / "config.p5r.yaml"),
                         str(BASE_DIR / "config" / "config.p5r.zh.yaml")])
