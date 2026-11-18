/** The quote form a brand-new workspace starts with. Admins (or the AI) can change it in the Field Configurator. */
export const DEFAULT_SCHEMA: any[] = [
  {
    title: "Client Information",
    allow_multiple: false,
    fields: [
      { label: "Client Name", name: "client_name", type: "text" },
      { label: "Contact Person", name: "contact_person", type: "text" },
      { label: "Email Address", name: "email_id", type: "text" },
      { label: "Phone Number", name: "phone_number", type: "text" },
      { label: "Billing Address", name: "billing_address", type: "text" },
      { label: "Created By", name: "created_by_email", type: "logged_in" }
    ]
  },
  {
    title: "Quote Details",
    allow_multiple: false,
    fields: [
      { label: "Pipeline Status", name: "status", type: "master_status", options: "Inquiry, Quotation Given, Approved, Lost" },
      { label: "Currency", name: "currency", type: "dropdown", options: "INR, USD, EUR, GBP, AED" },
      { label: "Incoterms", name: "incoterms", type: "dropdown", options: "EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP" },
      { label: "Payment Terms", name: "payment_terms", type: "text" },
      { label: "Delivery Terms", name: "delivery_terms", type: "text" },
      // Adds itself up from the line items: the quote list, the pipeline value and {{subtotal}}
      // in the PDF all read this, so leaving it to be typed by hand would show a quote as worth nothing.
      { label: "Subtotal", name: "subtotal", type: "calculated", options: "SUM[Products.item_br]" }
    ]
  },
  {
    title: "Products",
    allow_multiple: true,
    fields: [
      { label: "Item Name", name: "item_name", type: "text" },
      { label: "Item Code", name: "item_code", type: "text" },
      { label: "Quantity", name: "quantity", type: "number" },
      { label: "UOM", name: "uom", type: "dropdown", options: "SQM, KG, PCS, MTR" },
      { label: "Rate", name: "item_rate", type: "number" },
      { label: "Total", name: "item_br", type: "calculated", options: "{{quantity}} * {{item_rate}}" }
    ]
  },
  {
    title: "Official Documents",
    allow_multiple: true,
    fields: [
      { label: "File Name", name: "file_name", type: "text" },
      { label: "Upload Document", name: "file_path", type: "attachment" }
    ]
  }
];
