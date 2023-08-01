import React from "react";
import { createPortal } from "react-dom";
import { Outlet } from "react-router-dom";

import { Card, Layout, Notification, Profile } from "@stellar/design-system";

import "./index.scss";

interface AtomicSwapProps {
  hasHeader?: boolean;
  pubKey: string;
  error: string | null;
}

export const AtomicSwap = (props: AtomicSwapProps) => {
  const isOnExchangeTab =
    !location.pathname.includes("swapper-a") &&
    !location.pathname.includes("swapper-b");
  return (
    <>
      {props.hasHeader && (
        <Layout.Header hasThemeSwitch projectId="soroban-react-atomic-swap" />
      )}
      <div className="Layout__inset account-badge-row">
        {props.pubKey.length > 0 && (
          <Profile isShort publicAddress={props.pubKey} size="sm" />
        )}
      </div>
      <div className="Layout__inset layout">
        <div className="atomic-swap">
          {isOnExchangeTab && (
            <Notification
              title="In this tab, you are acting as the exchange."
              variant="primary"
            />
          )}
          <Card variant="primary">
            <Outlet />
          </Card>
        </div>
        {props.error !== null &&
          createPortal(
            <div className="notification-container">
              <Notification title={props.error!} variant="error" />
            </div>,
            document.getElementById("root")!,
          )}
      </div>
    </>
  );
};
