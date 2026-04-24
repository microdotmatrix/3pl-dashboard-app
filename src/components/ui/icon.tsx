"use client";

import { Icon as IconifyIcon, type IconProps } from "@iconify/react";

interface AppIconProps extends Omit<IconProps, "icon"> {
  name: string;
}

export function Icon({ name, ...props }: AppIconProps) {
  return <IconifyIcon icon={name} {...props} />;
}
