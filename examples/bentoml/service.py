from pathlib import Path
from typing import Annotated

import bentoml
from bentoml.validators import ContentType

from recover_magic_hour import recover


@bentoml.service(resources={"cpu": "1"})
class MagicHourRecovery:
    @bentoml.api
    def retrieve_image(self) -> Annotated[Path, ContentType("image/png")]:
        recover()
        return Path("output/magic-hour-image.png")


app = MagicHourRecovery.to_asgi()
