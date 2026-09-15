"""pydantic v2 request/response models — the API contract (05 §2).

JSON field names are camelCase (`alias_generator=to_camel`), Python attributes snake_case (06 D).
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Base for every contract model: camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
