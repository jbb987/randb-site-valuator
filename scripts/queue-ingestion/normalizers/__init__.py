"""Per-ISO normalizers. Each module exports `normalize(df) -> list[dict]`."""
from . import pjm, miso, ercot, spp, caiso, nyiso, isone

ALL = {
    "PJM": pjm,
    "MISO": miso,
    "ERCOT": ercot,
    "SPP": spp,
    "CAISO": caiso,
    "NYISO": nyiso,
    "ISONE": isone,
}
