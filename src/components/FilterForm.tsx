import type { DashboardFilters, DashboardOptions } from "@/lib/dashboard";

type FilterFormProps = {
  filters: DashboardFilters;
  options: DashboardOptions;
};

type SelectFieldProps = {
  name: string;
  label: string;
  value: string;
  options: string[];
};

type TextFieldProps = {
  name: string;
  label: string;
  value: string;
  type?: string;
};

type NumberFieldProps = {
  name: string;
  label: string;
  value: string;
};

function SelectField({ name, label, value, options }: SelectFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value || ""}>
        <option value="">Alles</option>
        {options.map(option => (
          <option key={`${name}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ name, label, value, type = "text" }: TextFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} defaultValue={value || ""} />
    </label>
  );
}

function NumberField({ name, label, value }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type="number" step="0.01" defaultValue={value || ""} />
    </label>
  );
}

export function FilterForm({ filters, options }: FilterFormProps) {
  return (
    <form className="filter-panel" method="GET">
      <div className="filter-grid">
        <SelectField
          name="strategyVersion"
          label="Strategy"
          value={filters.strategyVersion}
          options={options.strategyVersions}
        />

        <SelectField name="symbol" label="Symbol" value={filters.symbol} options={options.symbols} />
        <SelectField name="side" label="Side" value={filters.side} options={options.sides} />
        <SelectField name="eventType" label="Event" value={filters.eventType} options={options.eventTypes} />
        <SelectField name="setupClass" label="Setup" value={filters.setupClass} options={options.setupClasses} />
        <SelectField name="grade" label="Grade" value={filters.grade} options={options.grades} />
        <SelectField name="reason" label="Reason" value={filters.reason} options={options.reasons} />
        <SelectField name="regime" label="Regime" value={filters.regime} options={options.regimes} />
        <SelectField name="flow" label="Flow" value={filters.flow} options={options.flows} />
        <SelectField name="btcState" label="BTC state" value={filters.btcState} options={options.btcStates} />
        <SelectField name="rsiZone" label="RSI zone" value={filters.rsiZone} options={options.rsiZones} />
        <SelectField name="rsiEdge" label="RSI edge" value={filters.rsiEdge} options={options.rsiEdges} />
        <SelectField name="obBias" label="OB bias" value={filters.obBias} options={options.obBiases} />
        <SelectField name="obRelation" label="OB relation" value={filters.obRelation} options={options.obRelations} />
        <SelectField name="spreadBucket" label="Spread" value={filters.spreadBucket} options={options.spreadBuckets} />
        <SelectField name="depthBucket" label="Depth" value={filters.depthBucket} options={options.depthBuckets} />

        <label className="field">
          <span>Outcome</span>
          <select name="outcome" defaultValue={filters.outcome || ""}>
            <option value="">Alles</option>
            <option value="WIN">Win</option>
            <option value="LOSS">Loss</option>
            <option value="FLAT">Flat</option>
          </select>
        </label>

        <TextField name="from" label="From" value={filters.from} type="date" />
        <TextField name="to" label="To" value={filters.to} type="date" />
      </div>

      <div className="filter-grid optimizer-grid">
        <NumberField name="minTrades" label="Min trades" value={filters.minTrades} />
        <NumberField name="winrateWeight" label="Winrate gewicht" value={filters.winrateWeight} />
        <NumberField name="pnlWeight" label="PnL gewicht" value={filters.pnlWeight} />
        <NumberField name="avgRWeight" label="Avg R gewicht" value={filters.avgRWeight} />
        <NumberField name="totalRWeight" label="Total R gewicht" value={filters.totalRWeight} />
        <NumberField name="profitFactorWeight" label="Profit factor gewicht" value={filters.profitFactorWeight} />
        <NumberField name="directSlWeight" label="Direct SL straf" value={filters.directSlWeight} />
        <NumberField name="nearTpWeight" label="Near TP gewicht" value={filters.nearTpWeight} />
        <NumberField name="wilsonWeight" label="Wilson gewicht" value={filters.wilsonWeight} />
      </div>

      <div className="filter-actions">
        <button type="submit">Toepassen</button>
        <a href="/">Reset</a>
      </div>
    </form>
  );
}