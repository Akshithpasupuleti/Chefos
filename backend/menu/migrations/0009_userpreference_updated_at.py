from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("menu", "0008_userpreference_people_count"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpreference",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]
