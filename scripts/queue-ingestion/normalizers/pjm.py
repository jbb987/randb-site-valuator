"""PJM — POI substation is in the `Project Name` field, not `Interconnection Location`."""
from ._base import normalize_row


def normalize(df):
    """Returns list of normalized dicts."""
    out = []
    for _, row in df.iterrows():
        # PJM puts the substation name + voltage in Project Name; Interconnection Location is empty.
        # Pass project_name_field as the POI source AND keep it as project_name.
        n = normalize_row(row, iso="PJM", poi_field="Project Name", project_name_field="Project Name")
        if n:
            out.append(n)
    return out
