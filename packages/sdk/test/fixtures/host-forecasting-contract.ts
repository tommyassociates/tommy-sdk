import type { HostApi, ForecastingErrorResult, SalesBandRuleParams } from '../../src/types.js';

declare const host: HostApi;
const expectType = <T>(_value: T): void => {};

async function hostContract() {
  const holidays = await host.holidays({ startAt: '2026-10-01', endAt: '2026-10-31', force: true });
  expectType<string>(holidays[0].id);
  expectType<ReadonlyArray<string>>(holidays[0].regions);
  // @ts-expect-error Force is a boolean, rather than a transport option object.
  host.holidays({ startAt: '2026-10-01', endAt: '2026-10-31', force: {} });
  // @ts-expect-error Host holiday regions are immutable strings.
  holidays[0].regions.push(42);

  const gate = await host.forecastingGate();
  expectType<boolean>(gate.experimental);
  expectType<boolean>(gate.plusOrPro);
  expectType<boolean>(gate.salesForecastingEnabled);
  expectType<boolean>(gate.demandPlanningEnabled);
  const settings = await host.forecasting.settings();
  expectType<string>(settings.businessDayCutoff);
  expectType<Readonly<Record<string, string>>>(settings.businessDayCutoffOverrides);
  expectType<number>(settings.forecastWeeksWindow);
  expectType<number>(settings.minGeneratedShiftHours);

  const weeks = await host.forecasting.weeks({ locationId: '7', isoWeeks: ['2026-W41'], kinds: ['total', 'count'] });
  await host.forecasting.weeks({ locationId: 7, isoWeeks: '2026-W41,2026-W42', kinds: 'total,count' });
  if ('error' in weeks) expectType<ForecastingErrorResult>(weeks);
  else {
    expectType<number>(weeks.pages[0].location_id);
    expectType<string>(weeks.pages[0].iso_week);
    expectType<boolean>(weeks.pages[0].complete);
    expectType<string>(weeks.pages[0].content_hash);
    expectType<readonly [number, number | null, number | null]>(weeks.pages[0].buckets[0]);
    // @ts-expect-error Successful host reads are unwrapped, rather than {ok,data}.
    weeks.data.pages;
  }
  const manifest = await host.forecasting.manifest({ locationId: 7, from: '2026-10-01', to: '2026-10-31' });
  if (!('error' in manifest)) expectType<string>(manifest.weeks['2026-W41']);
  const models = await host.forecasting.demandModels({ etag: '"models-1"' });
  await host.forecasting.demandModels();
  if ('error' in models) {
    expectType<number>(models.status);
    expectType<string | null>(models.code);
    expectType<string | null>(models.message);
  } else if (models.notModified) {
    expectType<string | null>(models.etag);
    // @ts-expect-error A 304 has no replacement model collection.
    models.demand_models;
  } else {
    expectType<boolean>(models.bands_omitted);
    expectType<string>(models.demand_models[0].config_version);
    const rule = models.demand_models[0].rules[0];
    expectType<number>(rule.role_tag_id);
    if (rule.kind === 'sales_band') expectType<'revenue' | 'tx_count'>(rule.params.metric);
    else expectType<number>(rule.params.headcount);
  }

  await host.forecasting.createDemandModel({ name: 'Floor staffing' });
  await host.forecasting.updateDemandModel({ id: '9', status: 'active' });
  await host.forecasting.deleteDemandModel({ id: 9 });
  // @ts-expect-error Model status is the server enum.
  host.forecasting.updateDemandModel({ id: 9, status: 'published' });
  const band: SalesBandRuleParams = { metric: 'revenue', per_value: 100, min: 1, max: 5, time_window: null };
  const rule = await host.forecasting.createRule({ modelId: '9', kind: 'sales_band', roleId: '3', locationId: null, params: band });
  if (!('error' in rule)) expectType<number>(rule.id);
  await host.forecasting.updateRule({ modelId: 9, ruleId: '2', active: false, position: 3 });
  await host.forecasting.createRule({ modelId: 9, kind: 'calendar', roleId: 3, params: { trigger: 'day_of_week', value: [1, 5], headcount: 2 } });
  await host.forecasting.deleteRule({ modelId: 9, ruleId: 2 });
  // @ts-expect-error Command IDs use camelCase; role_tag_id is a returned wire field.
  host.forecasting.updateRule({ modelId: 9, ruleId: 2, role_tag_id: 3 });
  // @ts-expect-error Sales band params use the API's metric enum.
  host.forecasting.createRule({ modelId: 9, kind: 'sales_band', roleId: 3, params: { metric: 'sales', per_value: 100, min: 1, max: 5 } });

  const estimates = await host.forecasting.estimates({ locationId: 7, from: '2026-10-01', to: '2026-10-31', since: '2026-10-01T00:00:00Z' });
  if (!('error' in estimates)) {
    expectType<string>(estimates.sales_estimates[0].business_date);
    expectType<number | null>(estimates.sales_estimates[0].tx_count);
  }
  const estimate = await host.forecasting.upsertEstimate({ locationId: '7', businessDate: '2026-10-07', hour: null, value: 250, txCount: 4, note: null });
  if (!('error' in estimate)) expectType<number | null>(estimate.hour);
  await host.forecasting.deleteEstimate({ locationId: 7, businessDate: '2026-10-07' });
  // @ts-expect-error Estimate commands take businessDate, not the snake_case return field.
  host.forecasting.upsertEstimate({ locationId: 7, business_date: '2026-10-07', value: 250 });
}

void hostContract;
