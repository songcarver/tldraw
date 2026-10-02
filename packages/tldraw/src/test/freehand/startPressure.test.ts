import { describe, expect, it } from 'vitest'
import { getStartPressureFromSpeed } from '../../lib/shapes/draw/getPath'
import { computeRadii, ingest, radii } from '../../lib/shapes/shared/freehand/core'
import { StrokeOptions } from '../../lib/shapes/shared/freehand/types'

// A fast, straight mouse stroke: points far apart, as from a flick.
const FAST_POINTS = Array.from({ length: 20 }, (_, i) => ({ x: i * 20, y: 0, z: 0.5 }))

const OPTIONS: StrokeOptions = {
	size: 10,
	thinning: 0.5,
	streamline: 0.5,
	smoothing: 0.5,
	simulatePressure: true,
	last: true,
}

function firstRadius(options: StrokeOptions) {
	ingest(FAST_POINTS, options)
	computeRadii(options)
	return radii[0]
}

describe('startPressure', () => {
	it('makes the start of a fast line thinner than the default', () => {
		expect(firstRadius({ ...OPTIONS, startPressure: 0.1 })).toBeLessThan(firstRadius(OPTIONS))
	})

	it('is ignored without simulated pressure', () => {
		const options = { ...OPTIONS, simulatePressure: false }
		expect(firstRadius({ ...options, startPressure: 0.1 })).toBe(firstRadius(options))
	})
})

describe('getStartPressureFromSpeed', () => {
	it('keeps the default for a pointer at rest', () => {
		expect(getStartPressureFromSpeed(0, 10)).toBeUndefined()
	})

	it('keeps the default for a slow pointer', () => {
		expect(getStartPressureFromSpeed(0.1, 10)).toBeUndefined()
	})

	it('gives a lower pressure for a faster pointer', () => {
		const medium = getStartPressureFromSpeed(0.4, 10)!
		const fast = getStartPressureFromSpeed(0.6, 10)!
		expect(medium).toBeLessThan(0.5)
		expect(fast).toBeLessThan(medium)
	})

	it('never goes below zero', () => {
		expect(getStartPressureFromSpeed(100, 10)).toBe(0)
	})
})

describe('getStartPressureFromSpeed curve', () => {
	it('thins medium speeds more with a curve below 1', () => {
		const linear = getStartPressureFromSpeed(0.4, 10)!
		expect(getStartPressureFromSpeed(0.4, 10, 0.5)!).toBeLessThan(linear)
	})

	it('keeps the default for medium speeds with a curve above 1', () => {
		expect(getStartPressureFromSpeed(0.4, 10, 3)).toBeUndefined()
	})
})
