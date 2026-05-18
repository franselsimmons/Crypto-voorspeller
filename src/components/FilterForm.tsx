import type { DashboardFilters, DashboardOptions } from "@/lib/dashboard";

type FilterFormProps = {
  filters: DashboardFilters;
  options: DashboardOptions;
};

type SelectFieldProps = {
  name: keyof DashboardFilters | string;
  label: string;
  value: string;
  options: string[];
};

type NumberFieldProps = {
  name: keyof DashboardFilters | string;
  label: string;
  value: string | number;
  step?: string;
};

function SelectField({ name, label, value, options }: SelectFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value || ""}>
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

function NumberField({ name, label, value, step = "any" }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={String(value ?? "")}
      />
    </label>
  );
}

function TextField({
  name,
  label,
  value,
  type = "text"
}: {
  name: keyof DashboardFilters | string;
  label: string;
  value: string;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} name={name} defaultValue={value || ""} />
    </label>
  );
}

export function FilterForm({ filters, options }: FilterFormProps) {
  return (
    <form className="filter-panel" method="get">
      <div className="filter-grid">
        <SelectField
          name="strategyVersion"
          label="Strategy"
          value={filters.strategyVersion}
          options={options.strategyVersions}
        />

        <SelectField
          name="symbol"
          label="Symbol"
          value={filters.symbol}
          options={options.symbols}
        />

        <SelectField
          name="eventType"
          label="Event"
          value={filters.eventType}
          options={options.eventTypes}
        />

        <SelectField
          name="reason"
          label="Reason"
          value={filters.reason}
          options={options.reasons}
        />

        <SelectField
          name="side"
          label="Side"
          value={filters.side}
          options={options.sides}
        />

        <SelectField
          name="setupClass"
          label="Setup"
          value={filters.setupClass}
          options={options.setupClasses}
        />

        <SelectField
          name="grade"
          label="Grade"
          value={filters.grade}
          options={options.grades}
        />

        <SelectField
          name="regime"
          label="Regime"
          value={filters.regime}
          options={options.regimes}
        />

        <SelectField
          name="flow"
          label="Flow"
          value={filters.flow}
          options={options.flows}
        />

        <SelectField
          name="btcState"
          label="BTC state"
          value={filters.btcState}
          options={options.btcStates}
        />

        <SelectField
          name="rsiZone"
          label="RSI zone"
          value={filters.rsiZone}
          options={options.rsiZones}
        />

        <SelectField
          name="rsiEdge"
          label="RSI edge"
          value={filters.rsiEdge}
          options={options.rsiEdges}
        />

        <SelectField
          name="obBias"
          label="OB bias"
          value={filters.obBias}
          options={options.obBiases}
        />

        <SelectField
          name="obRelation"
          label="OB relation"
          value={filters.obRelation}
          options={options.obRelations}
        />

        <SelectField
          name="spreadBucket"
          label="Spread"
          value={filters.spreadBucket}
          options={options.spreadBuckets}
        />

        <SelectField
          name="depthBucket"
          label="Depth"
          value={filters.depthBucket}
          options={options.depthBuckets}
        />

        <label className="field">
          <span>Outcome</span>
          <select name="outcome" defaultValue={filters.outcome}>
            <option value="">Alles</option>
            <option value="WIN">Win</option>
            <option value="LOSS">Loss</option>
            <option value="FLAT">Flat</option>
          </select>
        </label>

        <TextField name="from" label="Vanaf" value={filters.from} type="datetime-local" />
        <TextField name="to" label="Tot" value={filters.to} type="datetime-local" />
      </div>

      <div className="filter-grid optimizer-grid">
        <NumberField name="minTrades" label="Min trades" value={filters.minTrades} step="1" />
        <NumberField name="winrateWeight" label="Winrate gewicht" value={filters.winrateWeight} />
        <NumberField name="pnlWeight" label="PnL gewicht" value={filters.pnlWeight} />
        <NumberField name="avgRWeight" label="Avg R gewicht" value={filters.avgRWeight} />
        <NumberField name="totalRWeight" label="Total R gewicht" value={filters.totalRWeight} />
        <NumberField name="directSlPenalty" label="Direct SL penalty" value={filters.directSlPenalty} />
        <NumberField name="nearTpWeight" label="Near TP gewicht" value={filters.nearTpWeight} />
      </div>

      <div className="filter-actions">
        <button type="submit">Filter toepassen</button>
        <a href="/" className="button-secondary">
          Reset
        </a>
      </div>
    </form>
  );
}