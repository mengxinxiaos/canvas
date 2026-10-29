"""Track provider-reported API costs without a local price table.

Revision ID: b81e4a30c912
Revises: 800a2d829333
"""
from alembic import op
import sqlalchemy as sa

revision = "b81e4a30c912"
down_revision = "800a2d829333"
branch_labels = None
depends_on = None


def upgrade():
    # create_all() is also used at app startup in this project. Inspect first so
    # upgrading after an application restart still works without duplicate tables.
    bind = op.get_bind()
    task_columns = {c["name"] for c in sa.inspect(bind).get_columns("tasks")}
    for name in ("user_id", "api_call_id"):
        if name not in task_columns:
            op.add_column("tasks", sa.Column(name, sa.String(), nullable=True))

    if "api_call_records" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "api_call_records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("operation_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("user_name", sa.String(), nullable=True),
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("project_name", sa.String(), nullable=True),
        sa.Column("node_id", sa.String(), nullable=True),
        sa.Column("task_id", sa.String(), nullable=True),
        sa.Column("conversation_id", sa.String(), nullable=True),
        sa.Column("call_type", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("cost", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(), nullable=True),
        sa.Column("cost_status", sa.String(), nullable=False),
        sa.Column("usage_json", sa.JSON(), nullable=True),
        sa.Column("provider_request_id", sa.String(), nullable=True),
        sa.Column("parameters_json", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_api_call_records_operation_id", "api_call_records", ["operation_id"])
    op.create_index("ix_api_calls_started_id", "api_call_records", ["started_at", "id"])
    op.create_index("ix_api_calls_user_started", "api_call_records", ["user_id", "started_at"])
    op.create_index("ix_api_calls_project_started", "api_call_records", ["project_id", "started_at"])


def downgrade():
    op.drop_table("api_call_records")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("api_call_id")
        batch.drop_column("user_id")
