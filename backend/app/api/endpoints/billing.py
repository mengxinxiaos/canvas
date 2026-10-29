"""Read-only administrator view of provider evidence and calculated costs."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, localcontext
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.domain import APICall, User

router = APIRouter()
SHANGHAI = ZoneInfo("Asia/Shanghai")


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可查看 API 调用数据")
    return current_user


def call_filters(
    start_date: date | None = None,
    end_date: date | None = None,
    user_id: str | None = None,
    project_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    call_type: str | None = None,
    status: str | None = None,
    cost_status: str | None = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="开始日期不能晚于结束日期")
    filters = []
    if start_date:
        start = datetime.combine(start_date, time.min, SHANGHAI)
        filters.append(APICall.started_at >= start.astimezone(timezone.utc).replace(tzinfo=None))
    if end_date:
        # Exclusive next midnight includes all microseconds of the selected day.
        end = datetime.combine(end_date, time.min, SHANGHAI) + timedelta(days=1)
        filters.append(APICall.started_at < end.astimezone(timezone.utc).replace(tzinfo=None))
    for name, value in (
        ("user_id", user_id), ("project_id", project_id),
        ("provider", provider), ("model", model), ("call_type", call_type),
        ("status", status), ("cost_status", cost_status),
    ):
        if value:
            filters.append(getattr(APICall, name) == value)
    return filters


def _iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if value else None


def _item(row):
    names = (
        "id", "operation_id", "user_id", "user_name", "project_id", "project_name",
        "node_id", "task_id", "conversation_id", "call_type", "provider", "model",
        "status", "cost", "currency", "cost_status", "usage_json",
        "provider_request_id", "parameters_json", "duration_ms", "error_message",
        "provider_cost", "provider_currency", "billing_model", "pricing_snapshot",
    )
    result = {name: getattr(row, name) for name in names}
    result.update(started_at=_iso(row.started_at), completed_at=_iso(row.completed_at))
    return result


def _cost_totals(rows):
    totals = {}
    for row in rows:
        if row.cost_status not in ("reported", "calculated") or row.cost is None:
            continue
        try:
            amount = Decimal(row.cost)
        except (InvalidOperation, ValueError):
            continue
        if not amount.is_finite() or amount < 0:
            continue
        # Never combine unknown units across suppliers or infer a fiat currency.
        key = (row.currency, None if row.currency else row.provider)
        total = totals.setdefault(key, {"currency": key[0], "provider": key[1], "cost": Decimal(0), "calls": 0})
        with localcontext() as context:
            context.prec = 256
            total["cost"] += amount
        total["calls"] += 1
    return [
        {**value, "cost": format(value["cost"], "f")}
        for _, value in sorted(totals.items(), key=lambda item: (item[0][0] or "", item[0][1] or ""))
    ]


@router.get("/api-calls", dependencies=[Depends(require_admin)])
def list_api_calls(
    filters: list = Depends(call_filters),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(APICall).filter(*filters)
    total = query.count()
    rows = query.order_by(APICall.started_at.desc(), APICall.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"code": 0, "message": "ok", "data": {
        "items": [_item(row) for row in rows], "total": total,
        "page": page, "page_size": page_size,
    }}


@router.get("/api-calls/summary", dependencies=[Depends(require_admin)])
def summarize_api_calls(filters: list = Depends(call_filters), db: Session = Depends(get_db)):
    # Select only lightweight columns; don't load response/parameter JSON for aggregation.
    columns = (APICall.user_id, APICall.user_name, APICall.provider, APICall.model,
               APICall.status, APICall.cost, APICall.currency, APICall.cost_status)
    rows = db.query(*columns).filter(*filters).all()
    users = defaultdict(list)
    models = defaultdict(list)
    for row in rows:
        users[row.user_id].append(row)
        models[(row.provider, row.model)].append(row)
    # Options span all saved records so selecting one filter doesn't hide the others.
    user_options = dict(db.query(APICall.user_id, APICall.user_name).filter(APICall.user_id.isnot(None)).distinct().all())
    project_options = dict(db.query(APICall.project_id, APICall.project_name).filter(APICall.project_id.isnot(None)).distinct().all())
    return {"code": 0, "message": "ok", "data": {
        "total_calls": len(rows),
        "success_calls": sum(row.status == "success" for row in rows),
        "failed_calls": sum(row.status in ("failed", "interrupted") for row in rows),
        "pending_calls": sum(row.status not in ("success", "failed", "interrupted") for row in rows),
        "reported_cost_calls": sum(row.cost_status == "reported" and row.cost is not None for row in rows),
        "calculated_cost_calls": sum(row.cost_status == "calculated" and row.cost is not None for row in rows),
        "priced_cost_calls": sum(row.cost_status in ("reported", "calculated") and row.cost is not None for row in rows),
        "missing_cost_calls": sum(row.cost_status not in ("reported", "calculated") or row.cost is None for row in rows),
        "cost_totals": _cost_totals(rows),
        "by_user": [{"user_id": uid, "user_name": group[-1].user_name or uid or "未知用户",
                     "calls": len(group), "cost_totals": _cost_totals(group)}
                    for uid, group in sorted(users.items(), key=lambda pair: (-len(pair[1]), pair[0] or ""))],
        "by_model": [{"provider": key[0], "model": key[1], "calls": len(group), "cost_totals": _cost_totals(group)}
                     for key, group in sorted(models.items(), key=lambda pair: (-len(pair[1]), pair[0]))],
        "options": {
            "users": [{"id": key, "name": value or key} for key, value in sorted(user_options.items())],
            "projects": [{"id": key, "name": value or key} for key, value in sorted(project_options.items())],
            "providers": [r[0] for r in db.query(APICall.provider).distinct().order_by(APICall.provider).all()],
            "models": [r[0] for r in db.query(APICall.model).distinct().order_by(APICall.model).all()],
        },
    }}
