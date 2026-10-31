import React from 'react';

export const EMPTY_FORM = {
  data_mode: 'demo', scenario: '', location_name: '', region: '', latitude: '', longitude: '', crop: '', sowing_date: '', growth_stage: '',
  soil_type: '', moisture_value: '', moisture_date: '', soil_ph: '', irrigation: '', use_sample_soil: false,
};

const STAGES = ['pre_sowing', 'sowing', 'vegetative', 'flowering', 'grain_filling', 'harvesting'];
const SOILS = ['alluvial', 'black', 'red', 'laterite', 'sandy', 'loam', 'clay'];
const CROPS = ['wheat', 'rice', 'maize'];

export function formToPayload(f, language) {
  const n = (v) => (v === '' ? null : v);
  return {
    data_mode: f.data_mode, scenario: f.data_mode === 'demo' ? n(f.scenario) : null, language,
    location_name: n(f.location_name.trim()), region: n(f.region.trim()), latitude: n(f.latitude), longitude: n(f.longitude),
    crop: n(f.crop), sowing_date: n(f.sowing_date), growth_stage: n(f.growth_stage), soil_type: n(f.soil_type), soil_ph: n(f.soil_ph),
    soil_moisture: f.moisture_value === '' ? null : { value: f.moisture_value, unit: '%', observed_on: n(f.moisture_date) },
    irrigation_available: f.irrigation === 'yes' ? true : f.irrigation === 'no' ? false : null,
    use_sample_soil: f.data_mode === 'demo' && f.use_sample_soil,
  };
}

export function scenarioToForm(s) {
  const p = s.farm_profile;
  return {
    ...EMPTY_FORM, data_mode: 'demo', scenario: s.id, location_name: p.location_name, region: p.region, latitude: String(p.latitude), longitude: String(p.longitude),
    crop: p.crop, growth_stage: p.growth_stage, irrigation: p.irrigation_available ? 'yes' : 'no', use_sample_soil: true,
  };
}

export default function FarmForm({ ui, lang, form, setForm, sample, health, onSubmit, onLoadDemo, loading, fieldErrors, remember, setRemember, hasSaved, onDeleteSaved }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const errOf = (...keys) => keys.map((k) => fieldErrors[k]).find(Boolean);
  const Err = ({ id, keys }) => { const m = errOf(...keys); return m ? <p className="field-error" id={id} role="alert">{m}</p> : null; };
  const liveOk = Boolean(health && health.integrations.weather.status === 'configured');
  const scenarios = sample ? sample.scenarios : [];

  return (
    <form className="panel" onSubmit={onSubmit} noValidate>
      <h2>{ui.appName}</h2>

      <label id="dm">{ui.dataMode}</label>
      <div className="seg" role="group" aria-labelledby="dm">
        <button type="button" aria-pressed={form.data_mode === 'demo'} onClick={() => setForm((f) => ({ ...f, data_mode: 'demo' }))}>{ui.demo}</button>
        <button type="button" aria-pressed={form.data_mode === 'live'} disabled={!liveOk} onClick={() => setForm((f) => ({ ...f, data_mode: 'live' }))}>{ui.live}</button>
      </div>
      {!liveOk && <p className="muted">{ui.liveOff}</p>}

      {form.data_mode === 'demo' && (
        <>
          <button type="button" className="btn secondary" onClick={onLoadDemo}>{ui.loadDemo}</button>
          <label htmlFor="scenario">{ui.scenario}</label>
          <select id="scenario" value={form.scenario} onChange={(e) => { const s = scenarios.find((x) => x.id === e.target.value); if (s) setForm(scenarioToForm(s)); else setForm((f) => ({ ...f, scenario: '' })); }}>
            <option value="">—</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{lang === 'hi' ? s.label_hi : s.label}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={form.use_sample_soil} onChange={set('use_sample_soil')} />{ui.useSampleSoil}</label>
        </>
      )}

      <label htmlFor="loc">{ui.location}</label>
      <input id="loc" type="text" value={form.location_name} onChange={set('location_name')} aria-invalid={Boolean(errOf('location_name'))} aria-describedby="e-loc" autoComplete="off" />
      <Err id="e-loc" keys={['location_name']} />

      {form.data_mode === 'live' && (
        <div className="row">
          <div><label htmlFor="lat">{ui.lat}</label><input id="lat" type="number" step="any" inputMode="decimal" value={form.latitude} onChange={set('latitude')} aria-invalid={Boolean(errOf('latitude'))} /><Err id="e-lat" keys={['latitude']} /></div>
          <div><label htmlFor="lon">{ui.lon}</label><input id="lon" type="number" step="any" inputMode="decimal" value={form.longitude} onChange={set('longitude')} aria-invalid={Boolean(errOf('longitude'))} /><Err id="e-lon" keys={['longitude']} /></div>
        </div>
      )}

      <label htmlFor="crop">{ui.crop}</label>
      <select id="crop" value={form.crop} onChange={set('crop')} aria-invalid={Boolean(errOf('crop'))} aria-describedby="e-crop">
        <option value="">{ui.chooseCrop}</option>
        {CROPS.map((c) => <option key={c} value={c}>{ui.crops[c]}</option>)}
      </select>
      <Err id="e-crop" keys={['crop']} />

      <label htmlFor="stage">{ui.stage}</label>
      <select id="stage" value={form.growth_stage} onChange={set('growth_stage')} aria-invalid={Boolean(errOf('growth_stage'))}>
        <option value="">—</option>{STAGES.map((s) => <option key={s} value={s}>{ui.stages[s]}</option>)}
      </select>
      <Err id="e-stage" keys={['growth_stage']} />

      <label htmlFor="sow">{ui.sowing}</label>
      <input id="sow" type="date" value={form.sowing_date} onChange={set('sowing_date')} aria-invalid={Boolean(errOf('sowing_date'))} />
      <Err id="e-sow" keys={['sowing_date']} />

      <label htmlFor="soilType">{ui.soilType}</label>
      <select id="soilType" value={form.soil_type} onChange={set('soil_type')}><option value="">—</option>{SOILS.map((s) => <option key={s} value={s}>{ui.soils[s]}</option>)}</select>

      <div className="row">
        <div><label htmlFor="mv">{ui.soilMoisture}</label><input id="mv" type="number" step="any" inputMode="decimal" min="0" max="100" value={form.moisture_value} onChange={set('moisture_value')} aria-invalid={Boolean(errOf('soil_moisture', 'soil_moisture.value'))} /></div>
        <div><label htmlFor="md">{ui.soilDate}</label><input id="md" type="date" value={form.moisture_date} onChange={set('moisture_date')} aria-invalid={Boolean(errOf('soil_moisture.observed_on'))} /></div>
      </div>
      <Err id="e-mv" keys={['soil_moisture', 'soil_moisture.value', 'soil_moisture.unit', 'soil_moisture.observed_on']} />

      <label htmlFor="ph">{ui.soilPh}</label>
      <input id="ph" type="number" step="0.1" inputMode="decimal" value={form.soil_ph} onChange={set('soil_ph')} aria-invalid={Boolean(errOf('soil_ph'))} />
      <Err id="e-ph" keys={['soil_ph']} />

      <label htmlFor="irr">{ui.irrigation}</label>
      <select id="irr" value={form.irrigation} onChange={set('irrigation')}><option value="">{ui.unsure}</option><option value="yes">{ui.yes}</option><option value="no">{ui.no}</option></select>
      <Err id="e-scn" keys={['scenario', 'body', 'language', 'data_mode']} />

      <label className="check" style={{ marginTop: '1rem' }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{ui.remember}</label>
      {hasSaved && <button type="button" className="btn secondary small" style={{ marginTop: '.5rem' }} onClick={onDeleteSaved}>{ui.deleteSaved}</button>}

      <button className="btn" type="submit" disabled={loading}>{loading ? ui.checking : ui.submit}</button>
      {Object.keys(fieldErrors).length > 0 && <p className="field-error" role="alert">{ui.fixFields}</p>}
    </form>
  );
}
