import {
	EASINGS,
	PI,
	SIN,
	TLDefaultDashStyle,
	TLDrawShape,
	TLDrawShapeSegment,
	Vec,
	b64Vecs,
	modulate,
} from '@tldraw/editor'
import { StrokeOptions } from '../shared/freehand/types'

const PEN_EASING = (t: number) => t * 0.65 + SIN((t * PI) / 2) * 0.35

const simulatePressureSettings = (strokeWidth: number): StrokeOptions => {
	return {
		size: strokeWidth,
		thinning: 0.5,
		streamline: modulate(strokeWidth, [9, 16], [0.64, 0.74], true), // 0.62 + ((1 + strokeWidth) / 8) * 0.06,
		smoothing: 0.62,
		easing: EASINGS.easeOutSine,
		simulatePressure: true,
	}
}

const realPressureSettings = (strokeWidth: number): StrokeOptions => {
	return {
		size: 1 + strokeWidth * 1.2,
		thinning: 0.62,
		streamline: 0.62,
		smoothing: 0.62,
		simulatePressure: false,
		easing: PEN_EASING,
	}
}

const solidSettings = (strokeWidth: number): StrokeOptions => {
	return {
		size: strokeWidth,
		thinning: 0,
		streamline: modulate(strokeWidth, [9, 16], [0.64, 0.74], true), // 0.62 + ((1 + strokeWidth) / 8) * 0.06,
		smoothing: 0.62,
		simulatePressure: false,
		easing: EASINGS.linear,
	}
}

const solidRealPressureSettings = (strokeWidth: number): StrokeOptions => {
	return {
		size: strokeWidth,
		thinning: 0,
		streamline: 0.62,
		smoothing: 0.62,
		simulatePressure: false,
		easing: EASINGS.linear,
	}
}

export function getHighlightFreehandSettings({
	strokeWidth,
	showAsComplete,
}: {
	strokeWidth: number
	showAsComplete: boolean
}): StrokeOptions {
	return {
		size: 1 + strokeWidth,
		thinning: 0,
		streamline: 0.5,
		smoothing: 0.5,
		simulatePressure: false,
		easing: EASINGS.easeOutSine,
		last: showAsComplete,
	}
}

export function getFreehandOptions(
	shapeProps: { dash: TLDefaultDashStyle; isPen: boolean; isComplete: boolean },
	strokeWidth: number,
	forceComplete: boolean,
	forceSolid: boolean,
	startPressure?: number
): StrokeOptions {
	const last = shapeProps.isComplete || forceComplete

	if (forceSolid) {
		if (shapeProps.isPen) {
			return { ...solidRealPressureSettings(strokeWidth), last }
		} else {
			return { ...solidSettings(strokeWidth), last }
		}
	}

	if (shapeProps.dash === 'draw') {
		if (shapeProps.isPen) {
			return { ...realPressureSettings(strokeWidth), last }
		} else {
			return { ...simulatePressureSettings(strokeWidth), startPressure, last }
		}
	}

	return { ...solidSettings(strokeWidth), last }
}

// About one pointer sample per frame, so a speed in px/ms becomes a point spacing in px.
const MS_PER_POINT = 16

/**
 * Get the simulated pressure at the start of a line from the pointer's speed when it began.
 * This uses the same rule as simulated pressure along the line: the further apart the
 * points, the thinner the line. Returns undefined when the pointer was too slow to make the
 * start thinner than the default, so slow starts keep the default behaviour.
 *
 * @param speed - The pointer's speed in page units per millisecond.
 * @param strokeWidth - The width of the stroke in page units.
 * @param curve - The exponent on the speed. 1 is linear. Less than 1 makes medium speeds
 *   thinner. More than 1 makes only fast starts thinner.
 */
export function getStartPressureFromSpeed(
	speed: number,
	strokeWidth: number,
	curve = 1
): number | undefined {
	if (!(speed > 0) || !(strokeWidth > 0)) return undefined
	const pressure = 1 - Math.min(1, (speed * MS_PER_POINT) / strokeWidth) ** curve
	return pressure < 0.5 ? pressure : undefined
}

/**
 * EXPERIMENT: the start pressure for a draw shape, from the data that the velocity-start
 * example puts in the shape's meta. Upstream, the start speed would be a shape prop.
 */
export function getExperimentalStartPressure(
	shape: TLDrawShape,
	points: Vec[],
	strokeWidth: number
): number | undefined {
	const meta = shape.meta as {
		startMode?: string
		startSpeed?: number
		startStrength?: number
		startCurve?: number
	}
	const strength = meta.startStrength ?? 1
	const curve = meta.startCurve ?? 1
	switch (meta.startMode) {
		case 'hover':
			return getStartPressureFromSpeed((meta.startSpeed ?? 0) * strength, strokeWidth, curve)
		case 'first-points': {
			// Use the spacing of the first few points as the speed.
			const count = Math.min(points.length - 1, 3)
			if (count < 1) return undefined
			let dist = 0
			for (let i = 1; i <= count; i++) dist += Vec.Dist(points[i], points[i - 1])
			return getStartPressureFromSpeed(
				((dist / count) * strength) / MS_PER_POINT,
				strokeWidth,
				curve
			)
		}
		default:
			return undefined
	}
}

/** @public */
export function getPointsFromDrawSegment(
	segment: TLDrawShapeSegment,
	scaleX: number,
	scaleY: number,
	points: Vec[] = []
) {
	const _points = b64Vecs.decodePoints(segment.path, segment.dim)

	// Apply scale factors (used for lazy resize and flipping)
	if (scaleX !== 1 || scaleY !== 1) {
		for (const point of _points) {
			point.x *= scaleX
			point.y *= scaleY
		}
	}

	if (segment.type === 'free' || _points.length < 2) {
		points.push(..._points.map(Vec.From))
	} else {
		// A B <interpolated points> D
		const A = Vec.From(_points[0])
		const D = Vec.From(_points[1])
		const dist = Vec.Dist(D, A)
		if (dist === 0) {
			points.push(A)
		} else {
			const uni = Vec.Tan(D, A)
			const nudgeDist = Math.min(1, Math.floor(dist / 4))
			const B = Vec.Add(A, Vec.Mul(uni, nudgeDist))
			const C = Vec.Add(D, Vec.Mul(uni, -nudgeDist))
			const interpolatedPointsCount = Math.max(4, Math.floor(dist / 16))
			points.push(A, ...Vec.PointsBetween(B, C, interpolatedPointsCount, EASINGS.easeInOutCubic), D)
		}
	}

	return points
}

/** @public */
export function getPointsFromDrawSegments(segments: TLDrawShapeSegment[], scaleX = 1, scaleY = 1) {
	const points: Vec[] = []

	for (const segment of segments) {
		getPointsFromDrawSegment(segment, scaleX, scaleY, points)
	}

	return points
}

export function getDrawShapeStrokeDashArray(
	shape: TLDrawShape,
	strokeWidth: number,
	dotAdjustment: number
) {
	return {
		draw: 'none',
		solid: `none`,
		dotted: `${dotAdjustment} ${strokeWidth * 2}`,
		dashed: `${strokeWidth * 2} ${strokeWidth * 2}`,
		none: `none`,
	}[shape.props.dash]
}
