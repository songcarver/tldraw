import { Editor, TLDrawShape, Tldraw, atom, createShapeId, useValue } from 'tldraw'
import 'tldraw/tldraw.css'

type StartMode = 'hover' | 'first-points' | 'baseline'
type SpeedSource = 'tldraw' | 'samples'
type Weighting = 'flat' | 'recent'

// [1]
const settings = atom('velocity start settings', {
	mode: 'hover' as StartMode,
	strength: 1,
	curve: 0.25,
	source: 'samples' as SpeedSource,
	windowMs: 40,
	weighting: 'recent' as Weighting,
	rawSamples: true,
	sideBySide: true,
})

// [4]
const CURVES = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4]

const lastStroke = atom('velocity start last stroke', { speed: 0, samples: 0 })

interface Sample {
	t: number
	x: number
	y: number
}

// [5]
function getSpeedFromSamples(
	samples: Sample[],
	now: number,
	windowMs: number,
	weighting: Weighting
) {
	const start = now - windowMs
	const weight = (t: number) => (weighting === 'recent' ? Math.max(0, (t - start) / windowMs) : 1)
	let distance = 0
	let time = 0
	let count = 0
	for (let i = 1; i < samples.length; i++) {
		const a = samples[i - 1]
		const b = samples[i]
		if (b.t <= start || b.t <= a.t) continue
		const t0 = Math.max(a.t, start)
		const part = (b.t - t0) / (b.t - a.t)
		const w = weight((t0 + b.t) / 2)
		distance += w * Math.hypot(b.x - a.x, b.y - a.y) * part
		time += w * (b.t - t0)
		count++
	}
	// The time since the last sample counts as standing still.
	const last = samples[samples.length - 1]
	if (last && now > last.t) {
		const t0 = Math.max(last.t, start)
		time += weight((t0 + now) / 2) * (now - t0)
	}
	return { speed: time > 0 ? distance / time : 0, count }
}

const MODES: { mode: StartMode; label: string }[] = [
	{ mode: 'hover', label: 'Speed at mouse-down' },
	{ mode: 'first-points', label: 'Spacing of first points' },
	{ mode: 'baseline', label: 'Off (today)' },
]

function onMount(editor: Editor) {
	;(window as any).editor = editor
	editor.setCurrentTool('draw')

	// [2]
	let tldrawSpeed = 0
	editor.on('frame', () => {
		if (!editor.inputs.getIsPointing()) {
			tldrawSpeed = editor.inputs.getPointerVelocity().len()
		}
	})

	let samples: Sample[] = []
	const onPointerMove = (e: PointerEvent) => {
		if (e.buttons !== 0) return
		const events = settings.get().rawSamples && e.getCoalescedEvents ? e.getCoalescedEvents() : []
		for (const c of events.length ? events : [e]) {
			samples.push({ t: c.timeStamp, x: c.clientX, y: c.clientY })
		}
		const cutoff = e.timeStamp - 1000
		if (samples[0].t < cutoff) samples = samples.filter((p) => p.t >= cutoff)
	}
	// The window gets the event before the canvas, so the sample is in before the shape exists.
	let pointerDownTime = 0
	const onPointerDown = (e: PointerEvent) => {
		samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
		pointerDownTime = e.timeStamp
	}
	window.addEventListener('pointermove', onPointerMove, { capture: true })
	window.addEventListener('pointerdown', onPointerDown, { capture: true })

	editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
		if (shape.type !== 'draw' || 'startMode' in shape.meta) return shape
		const { mode, strength, curve, source, windowMs, weighting } = settings.get()
		const measured =
			source === 'samples'
				? getSpeedFromSamples(samples, pointerDownTime, windowMs, weighting)
				: { speed: tldrawSpeed, count: 0 }
		const speed = measured.speed / editor.getZoomLevel()
		lastStroke.set({ speed, samples: measured.count })
		return {
			...shape,
			meta: {
				...shape.meta,
				startMode: mode,
				startSpeed: speed,
				startStrength: strength,
				startCurve: curve,
			},
		}
	})

	// [3]
	editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
		if (next.type !== 'draw') return
		const shape = next as TLDrawShape
		if ((prev as TLDrawShape).props.isComplete || !shape.props.isComplete) return
		if (!settings.get().sideBySide || shape.meta.startMode === 'baseline') return
		const bounds = editor.getShapePageBounds(shape)
		if (!bounds) return
		editor.createShape<TLDrawShape>({
			id: createShapeId(),
			type: 'draw',
			x: shape.x,
			y: shape.y + bounds.height + 40,
			rotation: shape.rotation,
			props: shape.props,
			meta: { ...shape.meta, startMode: 'baseline' },
		})
	})

	return () => {
		window.removeEventListener('pointermove', onPointerMove, { capture: true })
		window.removeEventListener('pointerdown', onPointerDown, { capture: true })
	}
}

function Panel() {
	const s = useValue('settings', () => settings.get(), [])
	const { speed, samples } = useValue('last stroke', () => lastStroke.get(), [])
	return (
		<div
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				pointerEvents: 'all',
				margin: 8,
				padding: '8px 12px',
				background: 'var(--tl-color-panel)',
				borderRadius: 8,
				boxShadow: 'var(--tl-shadow-2)',
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				fontSize: 12,
			}}
		>
			<div style={{ display: 'flex', gap: 10 }}>
				{MODES.map(({ mode, label }) => (
					<label key={mode} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
						<input
							type="radio"
							checked={s.mode === mode}
							onChange={() => settings.update((v) => ({ ...v, mode }))}
						/>
						{label}
					</label>
				))}
			</div>
			<label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
				Strength
				<input
					type="range"
					min={0.25}
					max={3}
					step={0.25}
					value={s.strength}
					onChange={(e) => settings.update((v) => ({ ...v, strength: Number(e.target.value) }))}
				/>
				{s.strength.toFixed(2)}×
			</label>
			<label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
				Curve
				<input
					type="range"
					min={0}
					max={CURVES.length - 1}
					step={1}
					value={CURVES.indexOf(s.curve)}
					onChange={(e) =>
						settings.update((v) => ({ ...v, curve: CURVES[Number(e.target.value)] }))
					}
				/>
				speed^{s.curve}
				<span style={{ opacity: 0.6 }}>
					{s.curve < 1
						? '(medium speeds thin more)'
						: s.curve > 1
							? '(only fast starts thin)'
							: '(linear)'}
				</span>
			</label>
			<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
				Speed from
				{(
					[
						['samples', 'Recent mouse samples'],
						['tldraw', "tldraw's velocity (last frame)"],
					] as const
				).map(([source, label]) => (
					<label key={source} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
						<input
							type="radio"
							checked={s.source === source}
							onChange={() => settings.update((v) => ({ ...v, source }))}
						/>
						{label}
					</label>
				))}
			</div>
			{s.source === 'samples' && (
				<>
					<label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
						Look back
						<input
							type="range"
							min={16}
							max={300}
							step={4}
							value={s.windowMs}
							onChange={(e) => settings.update((v) => ({ ...v, windowMs: Number(e.target.value) }))}
						/>
						{s.windowMs} ms
					</label>
					<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
						Weighting
						{(
							[
								['recent', 'Recent counts more'],
								['flat', 'Flat average'],
							] as const
						).map(([weighting, label]) => (
							<label key={weighting} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
								<input
									type="radio"
									checked={s.weighting === weighting}
									onChange={() => settings.update((v) => ({ ...v, weighting }))}
								/>
								{label}
							</label>
						))}
					</div>
					<label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
						<input
							type="checkbox"
							checked={s.rawSamples}
							onChange={(e) => settings.update((v) => ({ ...v, rawSamples: e.target.checked }))}
						/>
						Use every raw mouse sample (not one per frame)
					</label>
				</>
			)}
			<label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
				<input
					type="checkbox"
					checked={s.sideBySide}
					onChange={(e) => settings.update((v) => ({ ...v, sideBySide: e.target.checked }))}
				/>
				Copy each stroke below, drawn the old way
			</label>
			<div style={{ opacity: 0.6 }}>
				Last mouse-down speed: {speed.toFixed(2)} px/ms
				{s.source === 'samples' ? ` from ${samples} samples` : ''}. Top = new, bottom = old.
			</div>
		</div>
	)
}

export default function VelocityStartExample() {
	return (
		<div className="tldraw__editor">
			<Tldraw persistenceKey="velocity-start" onMount={onMount} components={{ TopPanel: Panel }} />
		</div>
	)
}

/*
[1]
Settings apply to new strokes only. Each stroke keeps its mode, speed, and strength in its
meta, so changing a setting doesn't redraw old strokes.

[2]
The editor sets the pointer velocity to zero on pointer down, so keep the velocity from the
last frame before the pointer went down. The draw tool creates the shape on pointer down,
so that is the speed at mouse-down. The velocity is in screen pixels per millisecond;
divide by the zoom to get page units.

[3]
When a stroke finishes, put a copy below it with the same points and the old start
behaviour, for a comparison.

[4]
The curve is an exponent on the speed. It changes the shape of the speed-to-pressure
curve, not its end points: a stop is still the default and a very fast start is still the
thinnest.

[5]
Get the speed over the last `windowMs` before mouse-down: the distance the pointer moved
divided by the time. With 'recent' weighting, each part of the path counts more the closer
it is to mouse-down. Time with no samples counts as standing still, so a pause before the
click gives a low speed.
*/
