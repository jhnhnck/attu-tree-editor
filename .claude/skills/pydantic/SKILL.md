---
name: pydantic
description: pydantic v2 reference card for the FamilyTreeEditor server. trigger when editing or creating files under `apps/server/attu_tree/models.py`, `apps/server/attu_tree/settings.py`, `apps/server/attu_tree/routers/`, `apps/server/attu_tree/sync/`, or `apps/server/attu_tree/auth/`; when any file imports `pydantic` or `pydantic_settings`; when writing `field_validator` / `model_validator` / `ConfigDict` / `BaseSettings`; when answering questions about validation, model serialization, ValidationError handling, or the toml settings loader.
---

# pydantic reference

scope: pinned to **pydantic v2** (`pydantic>=2.10` and `pydantic-settings>=2.7` per `apps/server/pyproject.toml`; current lockfile resolves to 2.12.x). if `apps/server/uv.lock` advances to pydantic 3.x, this skill is stale and must be re-verified against the v3 docs.

pydantic v1 → v2 was a breaking rewrite. v1 muscle memory (`@validator`, `class Config`, `parse_obj`, `dict()`) still surfaces in llm output and is wrong here. trust this file and the existing repo code over training-data recall.

## v1 → v2 cheat sheet

flag any of the left column on sight; rewrite to the right.

| v1 | v2 |
|---|---|
| `@validator('x')` | `@field_validator('x')` + `@classmethod` |
| `@root_validator` | `@model_validator(mode='before')` + `@classmethod`, **or** `@model_validator(mode='after')` (instance method, returns `self`) |
| `class Config: ...` (inner class) | `model_config = ConfigDict(...)` (class attribute) |
| `Config.allow_population_by_field_name = True` | `ConfigDict(populate_by_name=True)` |
| `Config.orm_mode = True` | `ConfigDict(from_attributes=True)` |
| `Config.allow_mutation = False` | `ConfigDict(frozen=True)` |
| `Model.parse_obj(d)` | `Model.model_validate(d)` |
| `Model.parse_raw(s)` | `Model.model_validate_json(s)` |
| `instance.dict()` | `instance.model_dump()` |
| `instance.json()` | `instance.model_dump_json()` |
| `instance.copy()` | `instance.model_copy()` |
| `Model.__fields__` | `Model.model_fields` |
| `Model.schema()` | `Model.model_json_schema()` |
| `Field(..., regex=r'...')` | `Field(..., pattern=r'...')` |
| `Field(..., min_items=1)` | `Field(..., min_length=1)` (lists/sets/dicts use length now) |
| `pydantic.error_wrappers.ValidationError` | `pydantic.ValidationError` |

`@validator` decorators that show up in this repo are bugs; rewrite them.

## ConfigDict options

```python
from pydantic import BaseModel, ConfigDict


class TreeCreateRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    ...
```

three `extra` modes:

- `'ignore'` - drop unknown keys, no error. tolerant default; matches `Settings` in `attu_tree/settings.py`.
- `'allow'` - keep unknown keys on the model as `__pydantic_extra__`. avoid; defeats the schema.
- `'forbid'` - raise `ValidationError` on unknown keys. use for request bodies where a typo should hard-fail (most wire models in `models.py` benefit from this).

other options worth knowing: `frozen=True`, `populate_by_name=True`, `str_strip_whitespace=True`, `validate_assignment=True`, `from_attributes=True`, `arbitrary_types_allowed=True`.

## validators

### `@field_validator`

```python
from pydantic import BaseModel, field_validator


class TreeCreateRequest(BaseModel):
    name: str
    schema_version: int

    @field_validator('schema_version', mode='before')
    @classmethod
    def coerce_to_int(cls, v: object) -> int:
        return int(v)  # pyright: ignore[reportArgumentType]
```

- **always** decorate with `@classmethod` directly under `@field_validator`; v2 enforces this.
- `mode='before'` runs against the raw input (string from a form, float from json) before pydantic's own coercion. use it to migrate legacy formats or accept multiple shapes.
- `mode='after'` (the default) runs once the field has been parsed to its declared type; use for cross-field-independent invariants.
- pass multiple field names to apply one validator to several fields.
- `mode='wrap'` and `mode='plain'` exist but aren't used in this repo.

### `@model_validator`

two distinct shapes; do not mix them up.

```python
from pydantic import BaseModel, model_validator


class Example(BaseModel):
    a: int
    b: int

    # mode='before' - classmethod operating on raw input dict; returns dict
    @model_validator(mode='before')
    @classmethod
    def normalize(cls, data: dict) -> dict:
        if 'legacy_a' in data:
            data['a'] = data.pop('legacy_a')
        return data

    # mode='after' - INSTANCE method (no @classmethod); returns self
    @model_validator(mode='after')
    def check_invariant(self) -> 'Example':
        if self.a > self.b:
            raise ValueError('a must be <= b')
        return self
```

footguns:
- `mode='before'` returning anything other than a dict (or whatever the model accepts as input) silently breaks validation.
- `mode='after'` returning a non-`self` value replaces the instance, almost never what you want; just `return self`.
- forgetting `@classmethod` on `mode='before'` raises a confusing v2 error (`first argument must be classmethod`).

### Field constraints

```python
from pydantic import BaseModel, Field


class TreeUpdateRequest(BaseModel):
    name: str = Field(default='', min_length=0, max_length=200)
    revision: int = Field(ge=0)
    tags: list[str] = Field(default_factory=list)
```

- numeric: `ge`, `gt`, `le`, `lt`, `multiple_of`.
- string: `min_length`, `max_length`, `pattern` (regex; was `regex` in v1).
- collection: `min_length`, `max_length` (was `min_items` / `max_items` in v1).
- mutable defaults (lists, dicts, sets): always `default_factory=list` / `default_factory=dict`, never `default=[]`. v2 still accepts `field: list[int] = []` because it auto-deepcopies, but `default_factory` is clearer.

`Annotated[int, Field(ge=0)]` is equivalent and works fine.

## serialization & parsing

| call | use |
|---|---|
| `Model.model_validate(d)` | parse a python dict (or any object with attrs if `from_attributes=True`). triggers full validation. |
| `Model.model_validate_json(s)` | parse a json string; faster than `model_validate(json.loads(s))`. |
| `instance.model_dump()` | dict of field values. options: `exclude_none=True`, `exclude_defaults=True`, `exclude={'field'}`, `include={...}`, `by_alias=True`, `mode='json'` (forces json-serializable primitives). |
| `instance.model_dump_json()` | json string in one shot. respects the same options. |
| `instance.model_copy(update={'field': value})` | shallow copy with overrides; does **not** re-run validators. use `Model.model_validate(instance.model_dump() \| {...})` if you need re-validation. |
| `Model.model_fields` | dict of `FieldInfo` keyed by field name; useful for generic form/route plumbing. |

**discord snowflake / json quirk**: snowflake ids are stored as strings on the wire (see `MeResponse.discord_id: str` in `attu_tree/models.py`). do not hand js a 64-bit integer; it loses precision above 2^53. when the doom-bot side passes integers via the bot HMAC channel, cast to `str(...)` at the boundary.

## the document vs runtime model split

```
sqlite row    ──►  wire model (pydantic)        ──►  domain code
                   models.py / routers/             auth/, sync/, trees/
                   extra='forbid' on inbound         validated
                   plain BaseModel on outbound       inputs
```

- **wire models** live in `apps/server/attu_tree/models.py`. one model per request body and one per response shape; types match what the api emits or accepts. inbound bodies should use `extra='forbid'` so a typoed key fails loudly; outbound responses can stay default (no `extra` needed).
- **settings models** live in `apps/server/attu_tree/settings.py`. these subclass `BaseSettings` (from `pydantic-settings`) and read from `data/trees-config.toml`. nested `BaseModel` sub-fields map to toml tables.
- **domain code** in `auth/`, `sync/`, `trees/` works on validated inputs and plain dataclass-shaped values, not raw json.

why the split: the wire model is the api contract and must reject malformed input loudly; the settings model is read once at startup; the domain layer never re-validates input that already came through the wire model.

## settings via pydantic-settings

`apps/server/attu_tree/settings.py` is the canonical example. every per-deployment value lives in `data/trees-config.toml` and is read via `TomlConfigSettingsSource`:

```python
from pydantic import BaseModel
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict
from pydantic_settings.sources.providers.toml import TomlConfigSettingsSource


class WikiConfig(BaseModel):
    base_url: str = 'https://attuproject.org'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        toml_file=os.getenv('TREES_CONFIG_PATH', '/app/data/trees-config.toml'),
        extra='ignore',
    )
    wiki: WikiConfig = WikiConfig()

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        return (init_settings, TomlConfigSettingsSource(settings_cls), env_settings, file_secret_settings)
```

adding a config field:

1. add the field to the relevant nested `BaseModel` in `settings.py` (e.g. `ServerConfig`, `WikiConfig`). give it a default.
2. add a sample value in `trees-config.example.toml` so a fresh deploy has a working stub.
3. that's it - `Settings()` reads it on next startup. **no plumbing required**; nested toml tables map automatically to nested pydantic models.

if a brand-new top-level table is needed, also add the attribute on `Settings` itself.

## fastapi request validation pattern

every mutation route in `apps/server/attu_tree/routers/` follows this shape:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from attu_tree.models import TreeCreateRequest, TreeCreateResponse

router = APIRouter()


@router.post('/trees', response_model=TreeCreateResponse)
async def create_tree(body: TreeCreateRequest, user=Depends(current_user), db=Depends(get_db)):
    # fastapi has already parsed body into TreeCreateRequest; validation errors
    # are auto-returned as 422 with a json error envelope. no try/except needed.
    new_id = await create_in_db(db, user.id, body.name, body.blob, body.schema_version)
    return TreeCreateResponse(id=new_id, revision=1)
```

points to remember:

- **let fastapi do the work**: declaring a typed `body: TreeCreateRequest` argument means fastapi validates and returns a 422 on failure automatically. don't write manual `ValidationError` `try/except` blocks unless you need a custom envelope.
- **response_model**: setting `response_model=...` on the route gets you outbound serialization and openapi schema for free.
- **discord snowflakes**: keep them as `str` in the wire model (see `MeResponse.discord_id`). never `int` on the response side.
- **revision-checked saves**: see `apps/server/attu_tree/sync/autosave.py` for the canonical "validate the body, then check revision against the db, then merge" sequence. `RevisionConflict` and `BlobTooLarge` are sentinels the route layer maps to 409/413 responses.

## common gotchas

- **`extra='ignore'` swallows typos.** use `extra='forbid'` on inbound request bodies so a misspelled field is caught at parse time, not silently dropped.
- **`mode='after'` model_validator must `return self`.** returning anything else (including `None`) replaces the instance with that value and breaks downstream code in baffling ways.
- **`mode='before'` validators need `@classmethod`.** v2 raises `'first argument must be classmethod'` if you forget; easy to miss when copy-pasting v1 code.
- **mutable default args.** prefer `Field(default_factory=list)` / `Field(default_factory=dict)` to `= []` / `= {}`. v2 deep-copies bare mutable defaults so `= []` is technically safe, but `default_factory` is unambiguous.
- **`model_copy(update=...)` skips validation.** use `Model.model_validate(existing.model_dump() | overrides)` when you need fields re-validated.
- **`model_dump(mode='json')` ≠ `model_dump_json()`.** the first returns a dict whose values are json-compatible primitives; the second returns a json string.
- **discord snowflake serialization.** declare snowflake fields as `str` in the wire model, full stop. never relay them as `int`.
- **`ValidationError` import path.** v2: `from pydantic import ValidationError`. v1: `from pydantic.error_wrappers import ValidationError`. the v1 path is gone; flag any imports from `pydantic.error_wrappers`.
- **list/dict field constraints.** `Field(min_length=1)` not `min_items=1`; v2 unified the name.
- **`Field(..., regex=...)` is gone.** use `pattern=`.

## quick links

- pydantic v2 docs: https://docs.pydantic.dev/latest/
- v1 → v2 migration guide: https://docs.pydantic.dev/latest/migration/
- pydantic-settings docs: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
- repo conventions: `notes/agents.md` section 5 (coding conventions) and section 4 (configuration system)
- canonical examples: `apps/server/attu_tree/models.py` (wire models), `apps/server/attu_tree/settings.py` (`BaseSettings` + toml source), `apps/server/attu_tree/sync/autosave.py` (revision-checked merge with `BlobTooLarge` / `RevisionConflict` sentinels)
