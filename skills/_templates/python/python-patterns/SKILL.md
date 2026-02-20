---
name: python-patterns
description: Python development patterns and best practices. Covers typing, async, testing, project structure, and common frameworks.
argument-hint: "[topic: typing|async|testing|structure|fastapi|django]"
---

# Python Patterns Guide

Modern Python patterns and best practices for building robust applications.

## Topics

### Type Hints (`/python-patterns typing`)

**Basic Types:**
```python
from typing import Optional, List, Dict, Union, Callable, TypeVar, Generic

def greet(name: str) -> str:
    return f"Hello, {name}"

def process_items(items: List[str]) -> Dict[str, int]:
    return {item: len(item) for item in items}

def find_user(user_id: int) -> Optional[User]:
    return db.get(user_id)

# Union types (Python 3.10+)
def process(value: int | str) -> None:
    pass
```

**Generics:**
```python
T = TypeVar('T')

class Repository(Generic[T]):
    def get(self, id: int) -> Optional[T]:
        ...

    def save(self, entity: T) -> T:
        ...

# Usage
user_repo: Repository[User] = Repository()
```

**Dataclasses & Pydantic:**
```python
from dataclasses import dataclass
from pydantic import BaseModel, Field

# Dataclass for simple data containers
@dataclass
class Point:
    x: float
    y: float

# Pydantic for validation
class UserCreate(BaseModel):
    email: str = Field(..., pattern=r'^[\w\.-]+@[\w\.-]+\.\w+$')
    password: str = Field(..., min_length=8)
    name: str = Field(..., max_length=100)
```

### Async (`/python-patterns async`)

**Async Basics:**
```python
import asyncio
from typing import List

async def fetch_data(url: str) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()

# Run multiple async operations concurrently
async def fetch_all(urls: List[str]) -> List[dict]:
    tasks = [fetch_data(url) for url in urls]
    return await asyncio.gather(*tasks)

# Context manager for async resources
class AsyncDatabase:
    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()
```

**Async Patterns:**
```python
# Semaphore for limiting concurrency
async def fetch_with_limit(urls: List[str], limit: int = 10):
    semaphore = asyncio.Semaphore(limit)

    async def fetch_one(url: str):
        async with semaphore:
            return await fetch_data(url)

    return await asyncio.gather(*[fetch_one(url) for url in urls])

# Timeout handling
async def fetch_with_timeout(url: str, timeout: float = 5.0):
    try:
        return await asyncio.wait_for(fetch_data(url), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(f"Request to {url} timed out")
```

### Testing (`/python-patterns testing`)

**Pytest Patterns:**
```python
import pytest
from unittest.mock import Mock, patch, AsyncMock

# Fixtures
@pytest.fixture
def user():
    return User(id=1, name="Test User", email="test@example.com")

@pytest.fixture
def db_session():
    session = create_test_session()
    yield session
    session.rollback()
    session.close()

# Parametrized tests
@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("world", "WORLD"),
    ("", ""),
])
def test_uppercase(input: str, expected: str):
    assert input.upper() == expected

# Mocking
def test_fetch_user(mocker):
    mock_db = mocker.patch('app.db.get_user')
    mock_db.return_value = User(id=1, name="Test")

    result = fetch_user(1)

    mock_db.assert_called_once_with(1)
    assert result.name == "Test"

# Async tests
@pytest.mark.asyncio
async def test_async_fetch():
    with patch('app.fetch_data', new_callable=AsyncMock) as mock:
        mock.return_value = {"data": "test"}
        result = await fetch_data("http://example.com")
        assert result == {"data": "test"}
```

### Project Structure (`/python-patterns structure`)

```
project/
├── pyproject.toml         # Project config (Poetry/PDM)
├── src/
│   └── myapp/
│       ├── __init__.py
│       ├── main.py        # Entry point
│       ├── config.py      # Settings
│       ├── models/        # Data models
│       │   ├── __init__.py
│       │   └── user.py
│       ├── services/      # Business logic
│       │   ├── __init__.py
│       │   └── user_service.py
│       ├── repositories/  # Data access
│       │   ├── __init__.py
│       │   └── user_repo.py
│       ├── api/           # API routes
│       │   ├── __init__.py
│       │   └── routes/
│       └── utils/         # Helpers
├── tests/
│   ├── conftest.py
│   ├── unit/
│   └── integration/
└── scripts/               # CLI scripts
```

### FastAPI (`/python-patterns fastapi`)

```python
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

app = FastAPI()

# Dependency injection
async def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Route with dependencies
@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# Background tasks
@app.post("/email")
async def send_email(
    email: EmailSchema,
    background_tasks: BackgroundTasks,
):
    background_tasks.add_task(send_email_task, email)
    return {"message": "Email queued"}
```

## Best Practices

1. **Use type hints** - Better IDE support and documentation
2. **Prefer composition** - Over inheritance
3. **Use context managers** - For resource management
4. **Write tests** - Pytest with fixtures
5. **Use virtual environments** - Poetry or PDM
6. **Format code** - Black + isort + ruff
7. **Document with docstrings** - Google or NumPy style
