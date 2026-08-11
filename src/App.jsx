import { useEffect, useState } from "react";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

import { Bar, Pie, Scatter } from "react-chartjs-2";

import {
  getDietTypes,
  getNutritionalInsights,
  getRecipes,
} from "./services/api";

import "./App.css";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getHeatmapColor(value) {
  const number = Number(value);
  const strength = Math.min(Math.abs(number), 1);
  const opacity = 0.25 + strength * 0.7;

  return number >= 0
    ? `rgba(37, 99, 235, ${opacity})`
    : `rgba(220, 38, 38, ${opacity})`;
}

function App() {
  // ============================================================
  // AUTHENTICATION STATE
  // ============================================================

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("authUser");

    try {
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      localStorage.removeItem("authUser");
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem("authToken");
  });

  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // ============================================================
  // DASHBOARD STATE
  // ============================================================

  const [dietTypes, setDietTypes] = useState([]);
  const [selectedDiet, setSelectedDiet] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dashboardData, setDashboardData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [recipeKeyword, setRecipeKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [recipeDiet, setRecipeDiet] = useState("all");
  const [recipes, setRecipes] = useState([]);

  const [recipePagination, setRecipePagination] = useState({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });

  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // API URL
  // ============================================================

 const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://phase3deit-api-e5gbd5gshacsa5h6.centralus-01.azurewebsites.net/api";
  // ============================================================
  // LOGIN
  // ============================================================

  async function handleLogin(email, password) {
    try {
      setAuthLoading(true);
      setAuthError("");

      const response = await fetch(
        `${API_BASE_URL}/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed.");
      }

      if (!data.token) {
        throw new Error("Login succeeded but no authentication token was returned.");
      }

      localStorage.setItem("authToken", data.token);

      if (data.user) {
        localStorage.setItem(
          "authUser",
          JSON.stringify(data.user)
        );
      }

      setToken(data.token);
      setUser(data.user || {
        email,
        name: email,
      });

    } catch (requestError) {
      console.error(requestError);
      setAuthError(requestError.message);
    } finally {
      setAuthLoading(false);
    }
  }

  // ============================================================
  // REGISTER
  // ============================================================

  async function handleRegister(name, email, password) {
    try {
      setAuthLoading(true);
      setAuthError("");

      const response = await fetch(
        `${API_BASE_URL}/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Registration failed."
        );
      }

      setAuthMode("login");
      setAuthError("");

      alert(
        "Registration successful! Please log in with your new account."
      );

    } catch (requestError) {
      console.error(requestError);
      setAuthError(requestError.message);
    } finally {
      setAuthLoading(false);
    }
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  function handleLogout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");

    setToken(null);
    setUser(null);

    setDashboardData(null);
    setRecipes([]);
    setDietTypes([]);
  }

  // ============================================================
  // INITIAL DASHBOARD LOAD
  // ============================================================

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    async function initializeDashboard() {
      try {
        setLoading(true);
        setError("");

        const [types, insights] = await Promise.all([
          getDietTypes(),
          getNutritionalInsights("all"),
        ]);

        setDietTypes(types);
        setDashboardData(insights);

      } catch (requestError) {
        console.error(requestError);
        setError(requestError.message);

        // If token is rejected, force logout.
        if (
          requestError.message.toLowerCase().includes("unauthorized") ||
          requestError.message.toLowerCase().includes("token")
        ) {
          handleLogout();
        }
      } finally {
        setLoading(false);
      }
    }

    initializeDashboard();
  }, [user, token]);

  // ============================================================
  // LOAD RECIPES
  // ============================================================

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    async function loadRecipes() {
      try {
        setRecipesLoading(true);
        setRecipesError("");

        const data = await getRecipes({
          keyword: appliedKeyword,
          dietType: recipeDiet,
          page: currentPage,
          pageSize: 10,
        });

        setRecipes(data.recipes);
        setRecipePagination(data.pagination);

      } catch (requestError) {
        console.error(requestError);
        setRecipesError(requestError.message);
      } finally {
        setRecipesLoading(false);
      }
    }

    loadRecipes();
  }, [
    user,
    token,
    appliedKeyword,
    recipeDiet,
    currentPage,
  ]);

  // ============================================================
  // RECIPE SEARCH
  // ============================================================

  function handleRecipeSearch(event) {
    event.preventDefault();

    setCurrentPage(1);
    setAppliedKeyword(recipeKeyword.trim());
  }

  function clearRecipeFilters() {
    setRecipeKeyword("");
    setAppliedKeyword("");
    setRecipeDiet("all");
    setCurrentPage(1);
  }

  // ============================================================
  // NUTRITIONAL INSIGHTS
  // ============================================================

  async function handleInsights() {
    try {
      setLoading(true);
      setError("");
      setNotice("");

      const typedDiet = searchTerm.trim().toLowerCase();

      const requestedDiet = dietTypes.includes(typedDiet)
        ? typedDiet
        : selectedDiet;

      const data = await getNutritionalInsights(
        requestedDiet
      );

      setSelectedDiet(requestedDiet);
      setDashboardData(data);

    } catch (requestError) {
      console.error(requestError);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // AUTHENTICATION SCREEN
  // ============================================================

  if (!user || !token) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
          background: "#f5f7fb",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "#ffffff",
            padding: "35px",
            borderRadius: "12px",
            boxShadow:
              "0 10px 30px rgba(0, 0, 0, 0.10)",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "10px",
            }}
          >
            Nutritional Dashboard
          </h1>

          <p
            style={{
              textAlign: "center",
              color: "#666",
              marginBottom: "25px",
            }}
          >
            {authMode === "login"
              ? "Sign in to access your dashboard"
              : "Create your account"}
          </p>

          {authError && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "12px",
                borderRadius: "6px",
                marginBottom: "15px",
              }}
            >
              {authError}
            </div>
          )}

          {authMode === "login" ? (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();

                  const form =
                    event.currentTarget;

                  handleLogin(
                    form.email.value,
                    form.password.value
                  );
                }}
              >
                <div style={{ marginBottom: "15px" }}>
                  <label
                    htmlFor="login-email"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Email
                  </label>

                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    required
                    style={{
                      width: "100%",
                      padding: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="login-password"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Password
                  </label>

                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    required
                    style={{
                      width: "100%",
                      padding: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    cursor: authLoading
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  {authLoading
                    ? "Logging in..."
                    : "Login"}
                </button>
              </form>

              <p
                style={{
                  textAlign: "center",
                  marginTop: "20px",
                }}
              >
                Don't have an account?{" "}

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError("");
                  }}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Register
                </button>
              </p>
            </>
          ) : (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();

                  const form =
                    event.currentTarget;

                  handleRegister(
                    form.name.value,
                    form.email.value,
                    form.password.value
                  );
                }}
              >
                <div style={{ marginBottom: "15px" }}>
                  <label
                    htmlFor="register-name"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Name
                  </label>

                  <input
                    id="register-name"
                    name="name"
                    type="text"
                    placeholder="Enter your name"
                    required
                    style={{
                      width: "100%",
                      padding: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label
                    htmlFor="register-email"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Email
                  </label>

                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    required
                    style={{
                      width: "100%",
                      padding: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    htmlFor="register-password"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "600",
                    }}
                  >
                    Password
                  </label>

                  <input
                    id="register-password"
                    name="password"
                    type="password"
                    placeholder="Create a password"
                    required
                    style={{
                      width: "100%",
                      padding: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    cursor: authLoading
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  {authLoading
                    ? "Creating account..."
                    : "Register"}
                </button>
              </form>

              <p
                style={{
                  textAlign: "center",
                  marginTop: "20px",
                }}
              >
                Already have an account?{" "}

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Login
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // DASHBOARD DATA
  // ============================================================

  const barData = dashboardData
    ? {
        labels: dashboardData.barChart.labels,
        datasets: [
          {
            label: "Protein (g)",
            data: dashboardData.barChart.protein,
          },
          {
            label: "Carbohydrates (g)",
            data: dashboardData.barChart.carbohydrates,
          },
          {
            label: "Fat (g)",
            data: dashboardData.barChart.fat,
          },
        ],
      }
    : null;

  const scatterData = dashboardData
    ? {
        datasets: [
          {
            label: "Protein vs Carbohydrates",
            data: dashboardData.scatterPlot,
            pointRadius: 3,
          },
        ],
      }
    : null;

  const pieData = dashboardData
    ? {
        labels: dashboardData.pieChart.labels,
        datasets: [
          {
            label: "Recipes",
            data: dashboardData.pieChart.values,
          },
        ],
      }
    : null;

  // ============================================================
  // DASHBOARD
  // ============================================================

  return (
    <div className="app">

      <header className="header">
        <h1>Nutritional Insights</h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "15px",
          }}
        >
          <span>
            Welcome,{" "}
            <strong>
              {user?.name || user?.email}
            </strong>
          </span>

          <button
            className="button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="main-content">

        <section>
          <h2>Explore Nutritional Insights</h2>

          {loading && (
            <div className="status-message">
              Loading nutritional insights...
            </div>
          )}

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="chart-grid">

            <article className="chart-card">
              <h3>Bar Chart</h3>

              <p>
                Average macronutrient content by diet type.
              </p>

              <div className="chart-area">
                {barData ? (
                  <Bar
                    data={barData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "bottom",
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                        },
                      },
                    }}
                  />
                ) : (
                  <p className="chart-placeholder">
                    Waiting for data...
                  </p>
                )}
              </div>
            </article>

            <article className="chart-card">
              <h3>Scatter Plot</h3>

              <p>
                Nutrient relationships (e.g., protein vs carbs).
              </p>

              <div className="chart-area">
                {scatterData ? (
                  <Scatter
                    data={scatterData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "bottom",
                        },
                      },
                      scales: {
                        x: {
                          title: {
                            display: true,
                            text: "Protein (g)",
                          },
                        },
                        y: {
                          title: {
                            display: true,
                            text: "Carbohydrates (g)",
                          },
                        },
                      },
                    }}
                  />
                ) : (
                  <p className="chart-placeholder">
                    Waiting for data...
                  </p>
                )}
              </div>
            </article>

            <article className="chart-card">
              <h3>Heatmap</h3>

              <p>Nutrient correlations.</p>

              <div className="chart-area heatmap-area">
                {dashboardData ? (
                  <table className="heatmap-table">
                    <thead>
                      <tr>
                        <th></th>

                        {dashboardData.heatmap.labels.map(
                          (label) => (
                            <th key={label}>
                              {label}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {dashboardData.heatmap.matrix.map(
                        (row, rowIndex) => (
                          <tr key={`row-${rowIndex}`}>
                            <th>
                              {
                                dashboardData.heatmap
                                  .labels[rowIndex]
                              }
                            </th>

                            {row.map(
                              (
                                value,
                                columnIndex
                              ) => (
                                <td
                                  key={`${rowIndex}-${columnIndex}`}
                                  style={{
                                    backgroundColor:
                                      getHeatmapColor(
                                        value
                                      ),
                                  }}
                                  title={`${dashboardData.heatmap.labels[rowIndex]} vs ${dashboardData.heatmap.labels[columnIndex]}: ${value}`}
                                >
                                  {Number(
                                    value
                                  ).toFixed(2)}
                                </td>
                              )
                            )}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                ) : (
                  <p className="chart-placeholder">
                    Waiting for data...
                  </p>
                )}
              </div>
            </article>

            <article className="chart-card">
              <h3>Pie Chart</h3>

              <p>
                Recipe distribution by diet type.
              </p>

              <div className="chart-area">
                {pieData ? (
                  <Pie
                    data={pieData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "bottom",
                        },
                      },
                    }}
                  />
                ) : (
                  <p className="chart-placeholder">
                    Waiting for data...
                  </p>
                )}
              </div>
            </article>

          </div>
        </section>

        {dashboardData && (
          <section className="metadata-section">

            <div className="metadata-card">
              <span>Selected Diet</span>
              <strong>
                {dashboardData.metadata.selectedDiet}
              </strong>
            </div>

            <div className="metadata-card">
              <span>Records Analyzed</span>
              <strong>
                {dashboardData.metadata.recordsAnalyzed}
              </strong>
            </div>

            <div className="metadata-card">
              <span>Total Records</span>
              <strong>
                {dashboardData.metadata.totalRecords}
              </strong>
            </div>

            <div className="metadata-card">
              <span>Execution Time</span>
              <strong>
                {dashboardData.metadata.executionTimeMs} ms
              </strong>
            </div>

          </section>
        )}

        <section className="interaction-section">
          <h2>Filters and Data Interaction</h2>

          <div className="filter-row">

            <input
              type="text"
              placeholder="Search by Diet Type"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
            />

            <select
              value={selectedDiet}
              onChange={(event) =>
                setSelectedDiet(event.target.value)
              }
            >
              <option value="all">
                All Diet Types
              </option>

              {dietTypes.map((diet) => (
                <option key={diet} value={diet}>
                  {capitalize(diet)}
                </option>
              ))}
            </select>

          </div>
        </section>

        <section className="api-section">
          <h2>API Data Interaction</h2>

          <div className="button-row">

            <button
              className="button insights-button"
              onClick={handleInsights}
              disabled={loading}
            >
              {loading
                ? "Loading..."
                : "Get Nutritional Insights"}
            </button>

            <button
              className="button recipes-button"
              onClick={() =>
                setNotice(
                  "Recipes are displayed in the section below."
                )
              }
            >
              Get Recipes
            </button>

            <button
              className="button clusters-button"
              onClick={() =>
                setNotice(
                  "Clustering is not required for the current Phase 3 dashboard."
                )
              }
            >
              Get Clusters
            </button>

          </div>

          {notice && (
            <p className="notice-message">
              {notice}
            </p>
          )}
        </section>

        <section className="recipes-section">
          <h2>Explore Recipes</h2>

          <form
            className="recipe-filters"
            onSubmit={handleRecipeSearch}
          >

            <label>
              <span>Keyword</span>

              <input
                type="search"
                placeholder="Search recipe or cuisine"
                value={recipeKeyword}
                onChange={(event) =>
                  setRecipeKeyword(
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              <span>Diet Type</span>

              <select
                value={recipeDiet}
                onChange={(event) => {
                  setRecipeDiet(
                    event.target.value
                  );

                  setCurrentPage(1);
                }}
              >
                <option value="all">
                  All Diet Types
                </option>

                {dietTypes.map((diet) => (
                  <option key={diet} value={diet}>
                    {capitalize(diet)}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="button insights-button"
              type="submit"
            >
              Search
            </button>

            <button
              className="button clear-button"
              type="button"
              onClick={clearRecipeFilters}
            >
              Clear Filters
            </button>

          </form>

          {recipesLoading && (
            <div className="status-message">
              Loading recipes...
            </div>
          )}

          {recipesError && (
            <div className="error-message">
              <strong>Error:</strong>{" "}
              {recipesError}
            </div>
          )}

          {!recipesLoading && !recipesError && (
            <>
              <p className="results-summary">
                {recipePagination.totalItems === 0
                  ? "No matching recipes found."
                  : `Showing ${
                      (recipePagination.page - 1) *
                        recipePagination.pageSize +
                      1
                    }-${Math.min(
                      recipePagination.page *
                        recipePagination.pageSize,
                      recipePagination.totalItems
                    )} of ${
                      recipePagination.totalItems
                    } recipes`}
              </p>

              <div className="recipe-grid">

                {recipes.map((recipe, index) => (
                  <article
                    className="recipe-card"
                    key={`${recipe.recipeName}-${index}`}
                  >
                    <div className="recipe-card-heading">

                      <h3>
                        {recipe.recipeName}
                      </h3>

                      <span>
                        {recipe.dietType}
                      </span>

                    </div>

                    <p>
                      {recipe.cuisineType}
                    </p>

                    <dl>

                      <div>
                        <dt>Protein</dt>
                        <dd>
                          {recipe.protein} g
                        </dd>
                      </div>

                      <div>
                        <dt>Carbs</dt>
                        <dd>
                          {recipe.carbohydrates} g
                        </dd>
                      </div>

                      <div>
                        <dt>Fat</dt>
                        <dd>
                          {recipe.fat} g
                        </dd>
                      </div>

                    </dl>
                  </article>
                ))}

              </div>
            </>
          )}

          <div className="pagination">

            <button
              onClick={() =>
                setCurrentPage(
                  (page) => Math.max(1, page - 1)
                )
              }
              disabled={
                recipesLoading ||
                currentPage === 1
              }
            >
              Previous
            </button>

            <span className="page-status">
              Page {recipePagination.page} of{" "}
              {Math.max(
                1,
                recipePagination.totalPages
              )}
            </span>

            <button
              onClick={() =>
                setCurrentPage(
                  (page) => page + 1
                )
              }
              disabled={
                recipesLoading ||
                recipePagination.totalPages === 0 ||
                currentPage >=
                  recipePagination.totalPages
              }
            >
              Next
            </button>

          </div>
        </section>

      </main>

      <footer className="footer">
        © 2026 Nutritional Insights. All Rights Reserved.
      </footer>

    </div>
  );
}

export default App;