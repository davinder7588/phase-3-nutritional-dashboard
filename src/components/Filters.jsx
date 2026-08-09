function Filters({
  selectedDiet,
  setSelectedDiet,
  onRefresh,
  loading,
}) {
  return (
    <section className="filters-section">
      <h2>Filters and Data Interaction</h2>

      <div className="filter-controls">
        <select
          value={selectedDiet}
          onChange={(event) => setSelectedDiet(event.target.value)}
        >
          <option value="All">All Diet Types</option>
          <option value="Vegan">Vegan</option>
          <option value="Keto">Keto</option>
          <option value="Mediterranean">Mediterranean</option>
          <option value="Paleo">Paleo</option>
        </select>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Loading..." : "Get Nutritional Insights"}
        </button>
      </div>
    </section>
  );
}

export default Filters;