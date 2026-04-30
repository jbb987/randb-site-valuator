from ._base import normalize_row


def normalize(df):
    return [n for n in (normalize_row(row, iso="NYISO") for _, row in df.iterrows()) if n]
