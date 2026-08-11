import io
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
import azure.functions as func
import pandas as pd

from azure.cosmos import CosmosClient, exceptions
from azure.storage.blob import (
    BlobServiceClient,
    ContentSettings
)

# cosmos db
app = func.FunctionApp(
    http_auth_level=func.AuthLevel.ANONYMOUS
)

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "authentication")
COSMOS_USERS_CONTAINER = os.getenv(
    "COSMOS_USERS_CONTAINER",
    "users"
)

cosmos_client = CosmosClient(COSMOS_ENDPOINT, COSMOS_KEY)
database = cosmos_client.get_database_client(COSMOS_DATABASE)
users_container = database.get_container_client(
    COSMOS_USERS_CONTAINER
)
JWT_SECRET = os.getenv("JWT_SECRET")


def create_json_response(
    data: dict,
    status_code: int = 200
) -> func.HttpResponse:
    """Return a standard JSON response."""
    return func.HttpResponse(
        json.dumps(data, allow_nan=False),
        status_code=status_code,
        mimetype="application/json"
    )

import uuid


@app.route(
    route="register",
    methods=["POST"]
)
def register(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = req.get_json()

        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))

        if not name or not email or not password:
            return create_json_response(
                {"error": "Name, email and password are required."},
                400
            )

        if len(password) < 8:
            return create_json_response(
                {"error": "Password must be at least 8 characters."},
                400
            )

        query = """
            SELECT * FROM c
            WHERE c.email = @email
        """

        existing_users = list(
            users_container.query_items(
                query=query,
                parameters=[
                    {"name": "@email", "value": email}
                ],
                enable_cross_partition_query=True
            )
        )

        if existing_users:
            return create_json_response(
                {"error": "An account with this email already exists."},
                409
            )

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        user = {
            "id": str(uuid.uuid4()),
            "name": name,
            "email": email,
            "password_hash": password_hash,
            "created_at": datetime.now(
                timezone.utc
            ).isoformat()
        }

        users_container.create_item(body=user)

        return create_json_response(
            {
                "message": "Account created successfully.",
                "user": {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"]
                }
            },
            201
        )

    except ValueError:
        return create_json_response(
            {"error": "Invalid JSON request."},
            400
        )

    except Exception as error:
        logging.exception("Registration failed: %s", error)

        return create_json_response(
            {"error": "Unable to create account."},
            500
        )

    
@app.route(
    route="login",
    methods=["POST"]
)
def login(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = req.get_json()

        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))

        if not email or not password:
            return create_json_response(
                {"error": "Email and password are required."},
                400
            )

        query = """
            SELECT * FROM c
            WHERE c.email = @email
        """

        users = list(
            users_container.query_items(
                query=query,
                parameters=[
                    {"name": "@email", "value": email}
                ],
                enable_cross_partition_query=True
            )
        )

        if not users:
            return create_json_response(
                {"error": "Invalid email or password."},
                401
            )

        user = users[0]

        password_matches = bcrypt.checkpw(
            password.encode("utf-8"),
            user["password_hash"].encode("utf-8")
        )

        if not password_matches:
            return create_json_response(
                {"error": "Invalid email or password."},
                401
            )

        token_payload = {
    "user_id": user["id"],
    "email": user["email"],
    "name": user["name"],
    "iat": datetime.now(timezone.utc),
    "exp": datetime.now(timezone.utc) + timedelta(hours=2)
}

        JWT_SECRET = os.getenv("JWT_SECRET")
        token = jwt.encode(
            token_payload,
            JWT_SECRET,
            algorithm="HS256"
        )

        return create_json_response({
            "message": "Login successful.",
            "token": token,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"]
            }
        })

    except ValueError:
        return create_json_response(
            {"error": "Invalid JSON request."},
            400
        )

    except Exception as error:
        logging.exception("Login failed: %s", error)

        return create_json_response(
            {"error": "Unable to process login."},
            500
        )
def get_authenticated_user(req: func.HttpRequest):
    auth_header = req.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()

    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"]
        )

        return payload

    except jwt.ExpiredSignatureError:
        return None

    except jwt.InvalidTokenError:
        return None
@app.route(
    route="auth-test",
    methods=["GET"]
)
def auth_test(req: func.HttpRequest) -> func.HttpResponse:
    user = get_authenticated_user(req)

    if not user:
        return create_json_response(
            {"error": "Unauthorized"},
            401
        )

    return create_json_response({
        "message": "Authentication successful.",
        "user": user
    })
    
def get_blob_service() -> BlobServiceClient:
    """Create the Azure Blob Storage client."""
    connection_string = os.getenv(
        "DIETS_STORAGE_CONNECTION_STRING"
    )

    if not connection_string:
        raise ValueError(
            "DIETS_STORAGE_CONNECTION_STRING is missing."
        )

    return BlobServiceClient.from_connection_string(
        connection_string
    )


def get_cosmos_container():
    """Return the Cosmos DB insights container."""
    endpoint = os.getenv("COSMOS_ENDPOINT")
    key = os.getenv("COSMOS_KEY")

    database_name = os.getenv(
        "COSMOS_DATABASE",
        "NutritionDashboard"
    )

    container_name = os.getenv(
        "COSMOS_CONTAINER",
        "insights"
    )

    if not endpoint:
        raise ValueError(
            "COSMOS_ENDPOINT is missing."
        )

    if not key:
        raise ValueError(
            "COSMOS_KEY is missing."
        )

    client = CosmosClient(
        endpoint,
        credential=key
    )

    database = client.get_database_client(
        database_name
    )

    return database.get_container_client(
        container_name
    )


def load_source_dataset() -> pd.DataFrame:
    """Download and read All_Diets.csv."""
    container_name = os.getenv(
        "DIETS_CONTAINER",
        "diets-data"
    )

    blob_name = os.getenv(
        "DIETS_BLOB",
        "All_Diets.csv"
    )

    blob_client = get_blob_service().get_blob_client(
        container=container_name,
        blob=blob_name
    )

    csv_bytes = (
        blob_client
        .download_blob()
        .readall()
    )

    return pd.read_csv(
        io.BytesIO(csv_bytes)
    )


def load_cleaned_dataset() -> pd.DataFrame:
    """Download and read cleaned_diets.csv."""
    container_name = os.getenv(
        "DIETS_CONTAINER",
        "diets-data"
    )

    cleaned_blob_name = os.getenv(
        "DIETS_CLEANED_BLOB",
        "cleaned_diets.csv"
    )

    blob_client = get_blob_service().get_blob_client(
        container=container_name,
        blob=cleaned_blob_name
    )

    csv_bytes = (
        blob_client
        .download_blob()
        .readall()
    )

    return pd.read_csv(
        io.BytesIO(csv_bytes)
    )


def clean_dataset(
    dataframe: pd.DataFrame
) -> pd.DataFrame:
    """Clean the columns required by the dashboard."""
    required_columns = [
        "Diet_type",
        "Recipe_name",
        "Cuisine_type",
        "Protein(g)",
        "Carbs(g)",
        "Fat(g)"
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    dataframe = dataframe.copy()

    dataframe["Diet_type"] = (
        dataframe["Diet_type"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    dataframe["Recipe_name"] = (
        dataframe["Recipe_name"]
        .astype(str)
        .str.strip()
    )

    dataframe["Cuisine_type"] = (
        dataframe["Cuisine_type"]
        .astype(str)
        .str.strip()
    )

    nutrient_columns = [
        "Protein(g)",
        "Carbs(g)",
        "Fat(g)"
    ]

    for column in nutrient_columns:
        dataframe[column] = pd.to_numeric(
            dataframe[column],
            errors="coerce"
        )

    dataframe = dataframe.dropna(
        subset=[
            "Diet_type",
            "Recipe_name",
            "Cuisine_type",
            "Protein(g)",
            "Carbs(g)",
            "Fat(g)"
        ]
    )

    dataframe = dataframe[
        dataframe["Diet_type"] != ""
    ]

    dataframe = dataframe[
        dataframe["Recipe_name"] != ""
    ]

    dataframe = dataframe.drop_duplicates()

    return dataframe.reset_index(
        drop=True
    )


def save_cleaned_dataset(
    dataframe: pd.DataFrame
) -> None:
    """Save cleaned_diets.csv in Blob Storage."""
    container_name = os.getenv(
        "DIETS_CONTAINER",
        "diets-data"
    )

    cleaned_blob_name = os.getenv(
        "DIETS_CLEANED_BLOB",
        "cleaned_diets.csv"
    )

    blob_client = get_blob_service().get_blob_client(
        container=container_name,
        blob=cleaned_blob_name
    )

    csv_content = dataframe.to_csv(
        index=False
    ).encode("utf-8")

    blob_client.upload_blob(
        csv_content,
        overwrite=True,
        content_settings=ContentSettings(
            content_type="text/csv"
        )
    )


def calculate_insights(
    dataframe: pd.DataFrame,
    diet_type: str
) -> dict:
    """Calculate chart results for one diet type."""
    calculation_start = time.perf_counter()

    if diet_type == "all":
        filtered_data = dataframe.copy()
        selected_label = "All Diet Types"
    else:
        filtered_data = dataframe[
            dataframe["Diet_type"] == diet_type
        ].copy()

        selected_label = diet_type.title()

    if filtered_data.empty:
        raise ValueError(
            f"No records found for '{diet_type}'."
        )

    available_diets = sorted(
        dataframe["Diet_type"]
        .unique()
        .tolist()
    )

    averages = (
        filtered_data
        .groupby("Diet_type")[
            [
                "Protein(g)",
                "Carbs(g)",
                "Fat(g)"
            ]
        ]
        .mean()
        .round(2)
    )

    bar_chart = {
        "labels": [
            label.title()
            for label in averages.index.tolist()
        ],
        "protein": [
            float(value)
            for value in averages[
                "Protein(g)"
            ].tolist()
        ],
        "carbohydrates": [
            float(value)
            for value in averages[
                "Carbs(g)"
            ].tolist()
        ],
        "fat": [
            float(value)
            for value in averages[
                "Fat(g)"
            ].tolist()
        ]
    }

    scatter_source = filtered_data[
        [
            "Protein(g)",
            "Carbs(g)"
        ]
    ].head(300)

    scatter_plot = [
        {
            "x": round(
                float(row["Protein(g)"]),
                2
            ),
            "y": round(
                float(row["Carbs(g)"]),
                2
            )
        }
        for _, row in scatter_source.iterrows()
    ]

    diet_counts = (
        dataframe["Diet_type"]
        .value_counts()
        .sort_index()
    )

    pie_chart = {
        "labels": [
            label.title()
            for label in diet_counts.index.tolist()
        ],
        "values": [
            int(value)
            for value in diet_counts.tolist()
        ]
    }

    correlation = (
        filtered_data[
            [
                "Protein(g)",
                "Carbs(g)",
                "Fat(g)"
            ]
        ]
        .corr()
        .fillna(0)
        .round(2)
    )

    heatmap = {
        "labels": [
            "Protein",
            "Carbohydrates",
            "Fat"
        ],
        "matrix": [
            [
                float(value)
                for value in row
            ]
            for row in correlation.values.tolist()
        ]
    }

    calculation_time_ms = round(
        (
            time.perf_counter()
            - calculation_start
        ) * 1000,
        2
    )

    return {
        "id": diet_type,
        "dietType": diet_type,
        "processedAt": datetime.now(
            timezone.utc
        ).isoformat(),
        "metadata": {
            "selectedDiet": selected_label,
            "recordsAnalyzed": int(
                len(filtered_data)
            ),
            "totalRecords": int(
                len(dataframe)
            ),
            "calculationTimeMs": (
                calculation_time_ms
            ),
            "source": "Cosmos DB cache"
        },
        "availableDietTypes": available_diets,
        "barChart": bar_chart,
        "scatterPlot": scatter_plot,
        "pieChart": pie_chart,
        "heatmap": heatmap
    }


def process_and_cache_dataset(
    dataframe: pd.DataFrame
) -> dict:
    """
    Clean the source data, save the cleaned CSV,
    calculate the chart results and cache them.
    """
    processing_start = time.perf_counter()

    cleaned_data = clean_dataset(
        dataframe
    )

    save_cleaned_dataset(
        cleaned_data
    )

    logging.info(
        "cleaned_diets.csv saved with %s records.",
        len(cleaned_data)
    )

    cosmos_container = get_cosmos_container()

    diet_types = sorted(
        cleaned_data["Diet_type"]
        .unique()
        .tolist()
    )

    processing_targets = [
        "all",
        *diet_types
    ]

    for diet_type in processing_targets:
        cached_result = calculate_insights(
            cleaned_data,
            diet_type
        )

        cosmos_container.upsert_item(
            body=cached_result
        )

        logging.info(
            "Cached results saved for: %s",
            diet_type
        )

    processing_time_ms = round(
        (
            time.perf_counter()
            - processing_start
        ) * 1000,
        2
    )

    summary = {
        "recordsProcessed": int(
            len(cleaned_data)
        ),
        "documentsCached": len(
            processing_targets
        ),
        "processingTimeMs": (
            processing_time_ms
        )
    }

    logging.info(
        "Processing completed: %s",
        summary
    )

    return summary


@app.blob_trigger(
    arg_name="input_blob",
    path="diets-data/All_Diets.csv",
    connection="DIETS_STORAGE_CONNECTION_STRING",
    source="EventGrid"
)
def process_diets_file(
    input_blob: func.InputStream
) -> None:
    """
    Event-based Blob Trigger for Flex Consumption.

    This function is retained as the project's
    Blob Trigger implementation.
    """
    logging.info(
        "Blob Trigger received: %s",
        input_blob.name
    )

    logging.info(
        "Source blob size: %s bytes",
        input_blob.length
    )

    dataframe = pd.read_csv(
        io.BytesIO(
            input_blob.read()
        )
    )

    process_and_cache_dataset(
        dataframe
    )


@app.event_grid_trigger(
    arg_name="event"
)
def process_diets_event(
    event: func.EventGridEvent
) -> None:
    """
    Direct Event Grid Trigger.

    This avoids the Blob-extension webhook
    validation problem while still processing
    only Blob Created events.
    """
    event_data = event.get_json()
    blob_url = event_data.get(
        "url",
        ""
    )

    logging.info(
        "Event Grid event received."
    )

    logging.info(
        "Blob URL: %s",
        blob_url
    )

    if not blob_url.endswith(
        "/diets-data/All_Diets.csv"
    ):
        logging.info(
            "Ignoring unrelated blob event."
        )
        return

    dataframe = load_source_dataset()

    process_and_cache_dataset(
        dataframe
    )


@app.route(
    route="health",
    methods=["GET"]
)
def health(
    req: func.HttpRequest
) -> func.HttpResponse:
    """Return backend health information."""
    return create_json_response({
        "status": "success",
        "message": (
            "Phase 3 diet dashboard backend "
            "is running"
        )
    })


@app.route(
    route="diet-types",
    methods=["GET"]
)
def diet_types(
    req: func.HttpRequest
) -> func.HttpResponse:
    """Return diet types from Cosmos DB."""
    try:
        cosmos_container = get_cosmos_container()

        cached_result = cosmos_container.read_item(
            item="all",
            partition_key="all"
        )

        return create_json_response({
            "dietTypes": cached_result.get(
                "availableDietTypes",
                []
            ),
            "source": "Cosmos DB cache"
        })

    except Exception as error:
        return create_json_response(
            {
                "error": (
                    "Unable to retrieve cached "
                    "diet types."
                ),
                "details": str(error)
            },
            status_code=500
        )


@app.route(
    route="insights",
    methods=["GET"]
)
def insights(
    req: func.HttpRequest
) -> func.HttpResponse:
    """Return precalculated results from Cosmos DB."""
    request_start = time.perf_counter()

    try:
        selected_diet = req.params.get(
            "dietType",
            "all"
        ).strip().lower()

        if selected_diet in {
            "",
            "all",
            "all diet types"
        }:
            selected_diet = "all"

        cosmos_container = get_cosmos_container()

        cached_result = cosmos_container.read_item(
            item=selected_diet,
            partition_key=selected_diet
        )

        response_time_ms = round(
            (
                time.perf_counter()
                - request_start
            ) * 1000,
            2
        )

        cached_result["metadata"][
            "apiResponseTimeMs"
        ] = response_time_ms

        cached_result["metadata"][
            "servedFromCache"
        ] = True

        return create_json_response(
            cached_result
        )

    except Exception as error:
        return create_json_response(
            {
                "error": (
                    "Cached insights are unavailable. "
                    "Process All_Diets.csv first."
                ),
                "details": str(error)
            },
            status_code=500
        )


@app.route(
    route="recipes",
    methods=["GET"]
)
def recipes(
    req: func.HttpRequest
) -> func.HttpResponse:
    """Return searchable and paginated recipes."""
    try:
        keyword = req.params.get(
            "keyword",
            ""
        ).strip()

        selected_diet = req.params.get(
            "dietType",
            "all"
        ).strip().lower()

        try:
            page = max(
                1,
                int(
                    req.params.get(
                        "page",
                        "1"
                    )
                )
            )

            page_size = int(
                req.params.get(
                    "pageSize",
                    "10"
                )
            )

            page_size = min(
                max(1, page_size),
                50
            )

        except ValueError:
            return create_json_response(
                {
                    "error": (
                        "page and pageSize must "
                        "be whole numbers."
                    )
                },
                status_code=400
            )

        dataframe = load_cleaned_dataset()

        if selected_diet not in {
            "",
            "all",
            "all diet types"
        }:
            dataframe = dataframe[
                dataframe["Diet_type"]
                .astype(str)
                .str.lower()
                == selected_diet
            ]

        if keyword:
            recipe_match = (
                dataframe["Recipe_name"]
                .astype(str)
                .str.contains(
                    keyword,
                    case=False,
                    na=False,
                    regex=False
                )
            )

            cuisine_match = (
                dataframe["Cuisine_type"]
                .astype(str)
                .str.contains(
                    keyword,
                    case=False,
                    na=False,
                    regex=False
                )
            )

            dataframe = dataframe[
                recipe_match | cuisine_match
            ]

        dataframe = dataframe.sort_values(
            by=[
                "Recipe_name",
                "Diet_type"
            ],
            kind="stable"
        )

        total_items = int(
            len(dataframe)
        )

        if total_items:
            total_pages = (
                total_items
                + page_size
                - 1
            ) // page_size
        else:
            total_pages = 0

        start_index = (
            page - 1
        ) * page_size

        page_data = dataframe.iloc[
            start_index:
            start_index + page_size
        ]

        recipe_items = [
            {
                "recipeName": str(
                    row["Recipe_name"]
                ),
                "dietType": str(
                    row["Diet_type"]
                ).title(),
                "cuisineType": str(
                    row["Cuisine_type"]
                ),
                "protein": round(
                    float(row["Protein(g)"]),
                    2
                ),
                "carbohydrates": round(
                    float(row["Carbs(g)"]),
                    2
                ),
                "fat": round(
                    float(row["Fat(g)"]),
                    2
                )
            }
            for _, row in page_data.iterrows()
        ]

        return create_json_response({
            "recipes": recipe_items,
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "totalItems": total_items,
                "totalPages": total_pages
            },
            "filters": {
                "keyword": keyword,
                "dietType": (
                    selected_diet
                    if selected_diet
                    else "all"
                )
            },
            "source": "cleaned_diets.csv"
        })

    

    except Exception as error:
        return create_json_response(
            {
                "error": (
                    "Unable to retrieve recipes. "
                    "Process All_Diets.csv first."
                ),
                "details": str(error)
            },
            status_code=500
        )

    