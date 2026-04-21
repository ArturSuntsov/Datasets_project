"""
Команда для автоматического создания тестовых аннотаторов при запуске проекта.
Запускается автоматически через entrypoint.sh или вручную:
python manage.py seed_annotators
"""
from django.core.management.base import BaseCommand
from apps.users.models import User
import bcrypt


class Command(BaseCommand):
    help = 'Создает тестовых аннотаторов (исполнителей) для разметки данных'

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=5,
            help='Количество аннотаторов для создания (по умолчанию 5)'
        )

    def handle(self, *args, **options):
        count = options['count']

        self.stdout.write(self.style.SUCCESS(f'🚀 Создание {count} тестовых аннотаторов...'))

        # Список готовых аннотаторов
        annotators = [
            {'username': 'annotator_alex', 'email': 'alex.annotator@test.com'},
            {'username': 'annotator_maria', 'email': 'maria.annotator@test.com'},
            {'username': 'annotator_dmitry', 'email': 'dmitry.annotator@test.com'},
            {'username': 'annotator_elena', 'email': 'elena.annotator@test.com'},
            {'username': 'annotator_sergey', 'email': 'sergey.annotator@test.com'},
            {'username': 'annotator_anna', 'email': 'anna.annotator@test.com'},
            {'username': 'annotator_pavel', 'email': 'pavel.annotator@test.com'},
            {'username': 'annotator_olga', 'email': 'olga.annotator@test.com'},
            {'username': 'annotator_ivan', 'email': 'ivan.annotator@test.com'},
            {'username': 'annotator_natalia', 'email': 'natalia.annotator@test.com'},
        ]

        created = 0
        password = 'annotator123'

        for i in range(min(count, len(annotators))):
            data = annotators[i]

            # Проверяем, существует ли уже такой пользователь
            if User.objects(email=data['email']).first():
                self.stdout.write(self.style.WARNING(f'  ⚠️ {data["email"]} уже существует, пропускаем'))
                continue

            # Создаем аннотатора
            user = User(
                email=data['email'],
                username=data['username'],
                role='annotator',
                is_active=True,
                balance=0.00,
                rating=round(4.0 + (i * 0.1), 1)
            )

            # Хеширование пароля (bcrypt rounds=4)
            salt = bcrypt.gensalt(rounds=4)
            user.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
            user.save()

            created += 1
            self.stdout.write(
                self.style.SUCCESS(f'  ✅ {data["username"]} ({data["email"]}) | Пароль: {password} | Рейтинг: {user.rating}')
            )

        self.stdout.write(self.style.SUCCESS(f'\n📊 ИТОГ: Создано {created} аннотаторов'))
        if created > 0:
            self.stdout.write(f'💡 Пароль для всех созданных: {password}')
