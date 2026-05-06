
import os
import re
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.domain import Media, Project

def get_safe_folder_name(name: str) -> str:
    name = name.strip()
    name = re.sub(r'[\\/:*?"<>|]', '_', name)
    name = re.sub(r'\s+', '_', name)
    name = name[:100]
    if not name:
        name = 'unnamed_project'
    return name

def get_project_folder(project: Project, create: bool = False) -> str:
    projects_root = os.path.join(settings.MEDIA_ROOT, 'projects')
    id_based_folder = os.path.join(projects_root, project.id)
    
    if create:
        os.makedirs(id_based_folder, exist_ok=True)
    
    return id_based_folder

def rename_project_folder(db: Session, project: Project, old_name: str) -> bool:
    return True

