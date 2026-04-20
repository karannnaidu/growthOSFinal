'use client'

import { useEffect, useState } from 'react'

type BatteryManager = { level: number; charging: boolean; addEventListener: (t: string, h: () => void) => void; removeEventListener: (t: string, h: () => void) => void }
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManager> }

export function useBatteryOk(): boolean {
  const [ok, setOk] = useState(true)

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery
    if (!nav.getBattery) return

    let battery: BatteryManager | null = null
    let cancelled = false

    const update = () => {
      if (!battery) return
      setOk(battery.charging || battery.level >= 0.2)
    }

    nav.getBattery().then((b) => {
      if (cancelled) return
      battery = b
      update()
      b.addEventListener('levelchange', update)
      b.addEventListener('chargingchange', update)
    })

    return () => {
      cancelled = true
      if (battery) {
        battery.removeEventListener('levelchange', update)
        battery.removeEventListener('chargingchange', update)
      }
    }
  }, [])

  return ok
}
