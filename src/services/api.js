const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://phase3deit-api-e5gbd5gshacsa5h6.centralus-01.azurewebsites.net/api";
  function getAuthHeaders() {
  const token = localStorage.getItem("authToken");

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}
export async function getDietTypes() {
 const response = await fetch(
  `${API_BASE_URL}/diet-types`,
  {
    headers: getAuthHeaders(),
  }
);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Unable to retrieve diet types."
    );
  }

  return data.dietTypes;
}

export async function getNutritionalInsights(
  dietType = "all"
) {
  const query = new URLSearchParams({
    dietType,
  });

  const response = await fetch(
  `${API_BASE_URL}/insights?${query.toString()}`,
  {
    headers: getAuthHeaders(),
  }
);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
        "Unable to retrieve nutritional insights."
    );
  }

  return data;
}

export async function getRecipes({
  keyword = "",
  dietType = "all",
  page = 1,
  pageSize = 10,
} = {}) {
  const query = new URLSearchParams({
    keyword,
    dietType,
    page: String(page),
    pageSize: String(pageSize),
  });

  const response = await fetch(
  `${API_BASE_URL}/recipes?${query.toString()}`,
  {
    headers: getAuthHeaders(),
  }
);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Unable to retrieve recipes."
    );
  }

  return data;
}