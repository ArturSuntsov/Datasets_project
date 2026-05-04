import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from apps.users.models import User
from apps.projects.models import Project
from apps.projects.export_utils import export_project_dataset
from rest_framework.test import APIClient

client = APIClient()

# Login as admin
response = client.post('/api/auth/login/', {'identifier': 'admin', 'password': 'admin123'}, format='json')
print('Login status:', response.status_code)
if response.status_code != 200:
    print('Login failed:', response.data)
    exit(1)

token = response.data.get('access')
print('Got token:', token[:20] if token else 'No token')
if not token:
    exit(1)

headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

# Get projects
resp = client.get('/api/projects/', **headers)
print('Projects status:', resp.status_code)
if resp.status_code != 200 or len(resp.data.get('items', [])) == 0:
    print('No projects found')
    exit(1)

project_id = resp.data['items'][0]['id']
print('Testing export for project:', project_id)

# Test JSON export
for fmt in ['json', 'csv', 'photo']:
    resp = client.get(f'/api/projects/{project_id}/export/?format={fmt}', **headers)
    print(f'Export {fmt}: status={resp.status_code}, size={len(resp.content)} bytes')
    if resp.status_code == 200:
        if fmt == 'json':
            import json
            try:
                data = json.loads(resp.content)
                print(f'  JSON items: {len(data)}')
            except:
                print(f'  Invalid JSON')
        elif fmt == 'csv':
            content = resp.content.decode('utf-8')
            lines = content.split('\n')
            print(f'  CSV lines: {len(lines)}')
        elif fmt == 'photo':
            print(f'  ZIP size: {len(resp.content)} bytes')

print('\nDone!')