#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

# This is the magic command that fixes the 404s
python manage.py collectstatic --noinput

# Run database migrations (optional but good)
python manage.py migrate