"""
Management command для создания тестовых данных.
Использование: python manage.py seed_test_data
"""

from django.core.management.base import BaseCommand
from bson import ObjectId

from apps.users.models import User
from apps.datasets_core.models import Dataset
from apps.projects.models import Project, Task


class Command(BaseCommand):
    help = "Создает тестовые данные для AnnotationPage"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Начало создания тестовых данных..."))

        # 1. Создаем тестового владельца (customer)
        owner_email = "customer@test.com"
        owner = User.objects(email=owner_email).first()
        if not owner:
            owner = User(
                email=owner_email,
                username="test_customer",
                role=User.ROLE_CUSTOMER,
                is_active=True,
            )
            owner.set_password("test123")
            owner.save()
            self.stdout.write(self.style.SUCCESS(f"✓ Создан владелец: {owner_email}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✓ Владелец уже существует: {owner_email}"))

        # 2. Создаем тестового аннотатора
        annotator_email = "annotator@test.com"
        annotator = User.objects(email=annotator_email).first()
        if not annotator:
            annotator = User(
                email=annotator_email,
                username="test_annotator",
                role=User.ROLE_ANNOTATOR,
                is_active=True,
                rating=0.0,
            )
            annotator.set_password("test123")
            annotator.save()
            self.stdout.write(self.style.SUCCESS(f"✓ Создан аннотатор: {annotator_email}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✓ Аннотатор уже существует: {annotator_email}"))

        # 3. Создаем тестовый датасет
        dataset = Dataset.objects(owner=owner).first()
        if not dataset:
            dataset = Dataset(
                owner=owner,
                name="Test Dataset for CV",
                description="Тестовый датасет для компьютерного зрения",
                status=Dataset.STATUS_ACTIVE,
                file_uri="https://example.com/dataset/test.zip",
                metadata={
                    "type": "computer_vision",
                    "annotation_format": "bbox_v1",
                },
            )
            dataset.save()
            self.stdout.write(self.style.SUCCESS(f"✓ Создан датасет: {dataset.name}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✓ Датасет уже существует: {dataset.name}"))

        # 4. Создаем тестовый проект
        project = Project.objects(owner=owner).first()
        if not project:
            project = Project(
                owner=owner,
                title="Test CV Project",
                description="Проект для тестирования annotation page",
                status=Project.STATUS_ACTIVE,
            )
            project.save()
            self.stdout.write(self.style.SUCCESS(f"✓ Создан проект: {project.title}"))
            self.stdout.write(self.style.WARNING(f"  Project ID: {project.id}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✓ Проект уже существует: {project.title}"))
            self.stdout.write(self.style.WARNING(f"  Project ID: {project.id}"))

        # 5. Создаем тестовые задачи
        tasks_count = Task.objects(project=project).count()
        if tasks_count == 0:
            test_images = [
                "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800",
                "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800",
                "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800",
            ]

            for i, image_url in enumerate(test_images, 1):
                task = Task(
                    project=project,
                    dataset=dataset,
                    status=Task.STATUS_PENDING,
                    difficulty_score=0.5 + (i * 0.1),  # Разная сложность
                    input_ref=image_url,
                )
                task.save()
                self.stdout.write(self.style.SUCCESS(f"✓ Создана задача #{i}: {task.id}"))

            self.stdout.write(self.style.SUCCESS(f"  Всего задач: {Task.objects(project=project).count()}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✓ Задачи уже существуют (всего: {tasks_count})"))

        # Итоговая информация
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("ТЕСТОВЫЕ ДАННЫЕ СОЗДАНЫ!"))
        self.stdout.write("=" * 60)
        self.stdout.write(f"\nВладелец (customer):")
        self.stdout.write(f"  Email: customer@test.com")
        self.stdout.write(f"  Password: test123")
        self.stdout.write(f"\nАннотатор:")
        self.stdout.write(f"  Email: annotator@test.com")
        self.stdout.write(f"  Password: test123")
        self.stdout.write(f"\nProject ID: {project.id}")
        self.stdout.write(f"\nURL для AnnotationPage:")
        self.stdout.write(f"  http://localhost:5173/projects/{project.id}/annotation")
        self.stdout.write("\n" + "=" * 60)
