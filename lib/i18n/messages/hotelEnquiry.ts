/**
 * The hotel page's two tabs, and the simpler enquiry pipeline (2026-11-09).
 * English is the source text; every language below has every key.
 */
export const en = {
  "inv.hotelTabs.details": "Details",
  "inv.hotelTabs.rooms": "Rooms & prices",
  "ops.enquiry.recordQuote": "Record a quote",
  "ops.enquiry.recordQuoteHint":
    "Saved in the timeline; the stage does not change. If the customer has the app, they get the amount there — no text is sent, so call them if not.",
  "ops.enquiry.reasonOptional": "Reason (optional)"
};

type Lang = Record<keyof typeof en, string>;

export const fr: Lang = {
  "inv.hotelTabs.details": "Informations",
  "inv.hotelTabs.rooms": "Chambres et prix",
  "ops.enquiry.recordQuote": "Enregistrer un devis",
  "ops.enquiry.recordQuoteHint":
    "Enregistré dans la chronologie ; l’étape ne change pas. Si le client a l’application, il y reçoit le montant — aucun SMS n’est envoyé, appelez-le sinon.",
  "ops.enquiry.reasonOptional": "Motif (facultatif)"
};

export const pt: Lang = {
  "inv.hotelTabs.details": "Detalhes",
  "inv.hotelTabs.rooms": "Quartos e preços",
  "ops.enquiry.recordQuote": "Registar um orçamento",
  "ops.enquiry.recordQuoteHint":
    "Fica registado na cronologia; a etapa não muda. Se o cliente tiver a aplicação, recebe lá o montante — não é enviado SMS, por isso ligue-lhe se não a tiver.",
  "ops.enquiry.reasonOptional": "Motivo (opcional)"
};

export const es: Lang = {
  "inv.hotelTabs.details": "Detalles",
  "inv.hotelTabs.rooms": "Habitaciones y precios",
  "ops.enquiry.recordQuote": "Registrar un presupuesto",
  "ops.enquiry.recordQuoteHint":
    "Queda en la cronología; la etapa no cambia. Si el cliente tiene la aplicación, recibe allí el importe; no se envía ningún SMS, así que llámele si no la tiene.",
  "ops.enquiry.reasonOptional": "Motivo (opcional)"
};

export const zh: Lang = {
  "inv.hotelTabs.details": "详情",
  "inv.hotelTabs.rooms": "房型与价格",
  "ops.enquiry.recordQuote": "记录报价",
  "ops.enquiry.recordQuoteHint":
    "记录在时间线中，阶段不变。如果客户安装了应用，将在应用中收到报价金额——不会发送短信，否则请致电客户。",
  "ops.enquiry.reasonOptional": "原因（选填）"
};

export const ar: Lang = {
  "inv.hotelTabs.details": "التفاصيل",
  "inv.hotelTabs.rooms": "الغرف والأسعار",
  "ops.enquiry.recordQuote": "تسجيل عرض سعر",
  "ops.enquiry.recordQuoteHint":
    "يسجل في التسلسل الزمني ولا تتغير المرحلة. إن كان لدى العميل التطبيق فسيتلقى المبلغ فيه — لا ترسل أي رسالة نصية، لذا اتصل به إن لم يكن لديه التطبيق.",
  "ops.enquiry.reasonOptional": "السبب (اختياري)"
};

export const ru: Lang = {
  "inv.hotelTabs.details": "Сведения",
  "inv.hotelTabs.rooms": "Номера и цены",
  "ops.enquiry.recordQuote": "Записать предложение",
  "ops.enquiry.recordQuoteHint":
    "Сохраняется в хронологии; этап не меняется. Если у клиента есть приложение, он увидит сумму там — SMS не отправляется, поэтому иначе позвоните ему.",
  "ops.enquiry.reasonOptional": "Причина (необязательно)"
};
