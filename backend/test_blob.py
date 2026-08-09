import io
import json
from pathlib import Path

import pandas as pd
from azure.storage.blob import BlobServiceClient


def load_settings() -> dict:
    settings_file = Path(__file__).parent / "local.settings.json"

    with settings_file.open("r", encoding="utf-8") as file:
        settings = json.load(file)

    return settings["Values"]


def main() -> None:
    settings = load_settings()

    connection_string = settings["DIETS_STORAGE_CONNECTION_STRING"]
    container_name = settings["DIETS_CONTAINER"]
    blob_name = settings["DIETS_BLOB"]

    blob_service = BlobServiceClient.from_connection_string(
        connection_string
    )

    blob_client = blob_service.get_blob_client(
        container=container_name,
        blob=blob_name
    )

    print(f"Downloading {blob_name} from {container_name}...")

    csv_bytes = blob_client.download_blob().readall()
    dataframe = pd.read_csv(io.BytesIO(csv_bytes))

    print("Blob downloaded successfully.")
    print(f"Rows: {len(dataframe)}")
    print(f"Columns: {len(dataframe.columns)}")

    print("\nColumn names:")
    print(dataframe.columns.tolist())

    print("\nFirst five rows:")
    print(dataframe.head())


if __name__ == "__main__":
    main()