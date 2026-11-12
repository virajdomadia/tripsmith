"""The v3 AI concierge (03 R26–R28, R33; 04 v3).

`model.py` is the provider-neutral contract; `gemini.py` is the only module that imports a model
SDK (and only on the first chat); `tools.py` are the catalog tools; `loop.py` is our own tool
loop; `budget.py` the site-wide cap; `chat.py` ties a turn together for `POST /chat`.
"""
