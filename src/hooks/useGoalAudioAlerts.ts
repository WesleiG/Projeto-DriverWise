import { useEffect, useRef } from 'react';
import { audioAlertSystem } from '../utils/audioAlerts';

interface UseGoalAudioAlertsProps {
  currentEarnings: number;
  dailyGoal: number;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  isShiftActive: boolean;
}

export function useGoalAudioAlerts({
  currentEarnings,
  dailyGoal,
  soundEnabled,
  voiceEnabled,
  isShiftActive,
}: UseGoalAudioAlertsProps) {
  const triggeredMilestonesRef = useRef<Set<number>>(new Set());

  // Resetar quando o turno for reiniciado
  useEffect(() => {
    if (!isShiftActive || currentEarnings === 0) {
      triggeredMilestonesRef.current.clear();
    }
  }, [isShiftActive, currentEarnings]);

  useEffect(() => {
    if (!isShiftActive || dailyGoal <= 0) return;

    const progressPct = (currentEarnings / dailyGoal) * 100;

    // Milestone 50%
    if (progressPct >= 50 && !triggeredMilestonesRef.current.has(50)) {
      triggeredMilestonesRef.current.add(50);
      if (soundEnabled) audioAlertSystem.playMilestoneSound(50);
      if (voiceEnabled) {
        audioAlertSystem.speakVoiceAlert(
          `Parabéns! Atingiu 50% da sua meta diária de ${dailyGoal} euros.`
        );
      }
    }

    // Milestone 75%
    if (progressPct >= 75 && !triggeredMilestonesRef.current.has(75)) {
      triggeredMilestonesRef.current.add(75);
      if (soundEnabled) audioAlertSystem.playMilestoneSound(75);
      if (voiceEnabled) {
        audioAlertSystem.speakVoiceAlert(
          `Excelente ritmo! 75% da meta diária alcançada.`
        );
      }
    }

    // Milestone 100%
    if (progressPct >= 100 && !triggeredMilestonesRef.current.has(100)) {
      triggeredMilestonesRef.current.add(100);
      if (soundEnabled) audioAlertSystem.playMilestoneSound(100);
      if (voiceEnabled) {
        audioAlertSystem.speakVoiceAlert(
          `Meta diária de ${dailyGoal} euros alcançada! Excelente trabalho.`
        );
      }
    }
  }, [currentEarnings, dailyGoal, soundEnabled, voiceEnabled, isShiftActive]);
}
