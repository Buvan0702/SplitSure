import { useEffect } from 'react';
import {
  withTiming,
  withSpring,
  withDelay,
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  interpolate,
  useDerivedValue,
} from 'react-native-reanimated';

// Timing configs
export const SPRING_CONFIG = { damping: 15, stiffness: 150, mass: 0.8 };
export const GENTLE_SPRING = { damping: 20, stiffness: 100, mass: 1 };

// Preset durations
export const DURATION = { fast: 200, normal: 350, slow: 500, entrance: 600 };

// Easing presets
export const EASE = {
  smooth: Easing.bezier(0.25, 0.1, 0.25, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
};

// Hook: Fade in up animation for list items
export const useFadeInUp = (delay: number = 0) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: DURATION.entrance,
        easing: EASE.decelerate,
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [20, 0]),
      },
    ],
  }));

  return { animatedStyle, progress };
};

// Hook: Scale in animation (for cards, modals)
export const useScaleIn = (delay: number = 0) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withSpring(1, SPRING_CONFIG)
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [0.85, 1]),
      },
    ],
  }));

  return { animatedStyle, progress };
};

// Hook: Slide from right animation
export const useSlideFromRight = (delay: number = 0) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: DURATION.normal,
        easing: EASE.decelerate,
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [50, 0]),
      },
    ],
  }));

  return { animatedStyle, progress };
};

// Function: Create staggered delay for list items
export const getStaggerDelay = (index: number, baseDelay: number = 50) => index * baseDelay;

// Hook: Shimmer effect for loading
export const useShimmer = () => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.linear,
      }),
      -1, // infinite
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [-100, 100]),
      },
    ],
  }));

  const opacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  return { animatedStyle, opacityStyle, progress };
};

// Hook: Pulse glow effect
export const useGlassPulse = () => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.7, 1]),
  }));

  return { animatedStyle, progress };
};

// Hook: Counter animation for numbers
export const useCountAnimation = (targetValue: number, duration: number = 1000) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration,
      easing: EASE.decelerate,
    });
  }, [targetValue]);

  const animatedValue = useDerivedValue(() => {
    return interpolate(progress.value, [0, 1], [0, targetValue]);
  });

  return { animatedValue, progress };
};

// Hook: Press scale animation for interactive elements
export const usePressScale = () => {
  const scale = useSharedValue(1);

  const onPressIn = () => {
    scale.value = withSpring(0.95, { damping: 20, stiffness: 300 });
  };

  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { animatedStyle, onPressIn, onPressOut };
};

// Hook: Rotate animation (useful for toggles)
export const useRotateAnimation = (targetRotation: number = 180) => {
  const progress = useSharedValue(0);

  const rotate = () => {
    progress.value = withSpring(progress.value === 0 ? 1 : 0, SPRING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(progress.value, [0, 1], [0, targetRotation])}deg`,
      },
    ],
  }));

  return { animatedStyle, rotate, progress };
};

// Hook: Slide in from top (for toasts/notifications)
export const useSlideFromTop = (delay: number = 0) => {
  const progress = useSharedValue(0);

  const show = () => {
    progress.value = withDelay(
      delay,
      withSpring(1, SPRING_CONFIG)
    );
  };

  const hide = () => {
    progress.value = withTiming(0, {
      duration: DURATION.fast,
      easing: EASE.accelerate,
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [-100, 0]),
      },
    ],
  }));

  return { animatedStyle, show, hide, progress };
};
