"use client";

import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const Form = FormProvider;

type FormFieldContextValue = {
  name: string;
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const { getFieldState, formState } = useFormContext();
  if (!fieldContext) {
    throw new Error("useFormField must be used within <FormField />");
  }
  const fieldState = getFieldState(fieldContext.name, formState);

  return {
    name: fieldContext.name,
    error: fieldState.error,
  };
}

const FormItemContext = React.createContext<{ id: string } | null>(null);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn("grid gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

function useFormItem() {
  const ctx = React.useContext(FormItemContext);
  if (!ctx) throw new Error("Form components must be used within <FormItem />");
  return ctx;
}

function FormLabel({ className, ...props }: React.ComponentProps<"label">) {
  const { id } = useFormItem();
  const { error } = useFormField();
  return (
    <Label
      data-slot="form-label"
      className={cn(error ? "text-destructive" : "", className)}
      htmlFor={id}
      {...props}
    />
  );
}

function FormControl({ className, ...props }: React.ComponentProps<"div">) {
  const { id } = useFormItem();
  const { error } = useFormField();
  return (
    <div
      data-slot="form-control"
      id={id}
      aria-invalid={error ? true : undefined}
      className={cn(className)}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="form-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error } = useFormField();
  if (!error?.message) return null;
  return (
    <p
      data-slot="form-message"
      className={cn("text-sm text-destructive", className)}
      role="alert"
      {...props}
    >
      {String(error.message)}
    </p>
  );
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
};

