FROM python:3.12-slim
RUN apt-get update && apt-get install -y ffmpeg libheif-dev curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app/ ./app/
COPY backend/addon[s]/ ./addons/
COPY addon[s]/ /tmp/_all_addons/
RUN find addons -maxdepth 1 -type l -delete 2>/dev/null; \
    for addon_dir in /tmp/_all_addons/*/; do \
      name="$(basename "$addon_dir")"; \
      if [ -d "$addon_dir/backend" ] && [ ! -d "addons/$name" ]; then \
        cp -r "$addon_dir/backend" "addons/$name"; \
      fi; \
      if [ -f "$addon_dir/manifest.json" ]; then \
        mkdir -p "addons/$name"; \
        cp "$addon_dir/manifest.json" "addons/$name/manifest.json"; \
      fi; \
    done && rm -rf /tmp/_all_addons
RUN if [ ! -f addons/__init__.py ]; then touch addons/__init__.py; fi
RUN for req in addons/*/requirements.txt; do \
      [ -f "$req" ] && pip install --no-cache-dir -r "$req"; \
    done; true
RUN for addon_dir in addons/*/; do \
      if [ -f "$addon_dir/install.sh" ]; then \
        sh "$addon_dir/install.sh"; \
      fi; \
    done; true
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
