import type { DashboardFilters, DashboardOptions } from "@/lib/dashboard";

type FilterFormProps = {
  filters: DashboardFilters;
  options: DashboardOptions;
};

function SelectField({
  name,
  label,
  value,
  options
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        <option value="">Alles</option>
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  name,
  label,
  value,
  step = "1"
}: {
  name: string;
  label: string;
  value: number;
  step?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type="number" step={step} defaultValue={value} />
    </label>
  );
}

export function FilterForm({ filters, options }: FilterFormProps) {
  return (
    <form className="panel filters" method="GET">
      <div className="panel-title">Filters</div>

      <div className="filter-grid">
        <label className="field">
          <span>Van</span>
          <input name="from" type="datetime-local" defaultValue={filters.from} />
        </label>

        <label className="field">
          <span>Tot</span>
          <input name="to" type="datetime-local" defaultValue={filters.to} />
        </label>

        <SelectField name="symbol" label="Coin" value={filters.symbol} options={options.symbols} />
        <SelectField name="side" label="Side" value={filters.side} options={options.sides} />
        <SelectField name="setupClass" label="Setup" value={filters.setupClass} options={options.setupClasses} />
        <SelectField name="grade" label="Grade" value={filters.grade} options={options.grades} />
        <SelectField name="regime" label="Regime" value={filters.regime} options={options.regimes} />
        <SelectField name="flow" label="Flow" value={filters.flow} options={options.flows} />
        <SelectField name="btcState" label="BTC state" value={filters.btcState} options={options.btcStates} />
        <SelectField name="obRelation" label="OB relation" value={filters.obRelation} options={options.obRelations} />
        <SelectField name="rsiZone" label="RSI zone" value={filters.rsiZone} options={options.rsiZones} />
        <SelectField name="spreadBucket" label="Spread" value={filters.spreadBucket} options={options.spreadBuckets} />
        <SelectField name="depthBucket" label="Depth" value={filters.depthBucket} options={options.depthBuckets} />

        <label className="field">
          <span>Outcome</span>
          <select name="outcome" defaultValue={filters.outcome}>
            <option value="">Alles</option>
            <option value="WIN">Win</option>
            <option value="LOSS">Loss</option>
            <option value="OPEN">Open</option>
            <option value="DIRECT_SL">Direct SL</option>
            <option value="NEAR_TP">Near TP</option>
          </select>
        </label>
      </div>

      <div className="panel-title panel-title-small">Optimizer score</div>

      <div className="filter-grid optimizer-grid">
        <NumberField name="minTrades" label="Min trades" value={filters.minTrades} />
        <NumberField name="winrateWeight" label="Winrate gewicht" value={filters.winrateWeight} />
        <NumberField name="pnlWeight" label="PnL gewicht" value={filters.pnlWeight} />
        <NumberField name="avgRWeight" label="Avg R gewicht" value={filters.avgRWeight} />
        <NumberField name="totalRWeight" label="Total R gewicht" value={filters.totalRWeight} />
        <NumberField name="directSlPenalty" label="Direct SL straf" value={filters.directSlPenalty} />
      </div>

      <div className="filter-actions">
        <button className="button button-primary" type="submit">
          Toepassen
        </button>

        <a className="button button-secondary" href="/">
          Reset
        </a>
      </div>
    </form>
  );
}