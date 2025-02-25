export const fightOrFlightDialogue = {
  intro: "Something shiny is sparkling\non the ground near that Pokémon!",
  title: "Fight or Flight",
  description: "It looks like there's a strong Pokémon guarding an item. Battling is the straightforward approach, but this Pokémon looks strong. You could also try to sneak around, though the Pokémon might catch you.",
  query: "What will you do?",
  option: {
    1: {
      label: "Battle the Pokémon",
      tooltip: "(-) Hard Battle\n(+) New Item",
      selected: "You approach the\nPokémon without fear.",
    },
    2: {
      label: "Steal the Item",
      disabled_tooltip: "Your Pokémon need to know certain moves to choose this",
      tooltip: "(+) {{option2PrimaryName}} uses {{option2PrimaryMove}}",
      selected: `.@d{32}.@d{32}.@d{32}
        $Your {{option2PrimaryName}} helps you out and uses {{option2PrimaryMove}}!
        $You nabbed the item!`,
    },
    3: {
      label: "Leave",
      tooltip: "(-) No Rewards",
      selected: "You leave the strong Pokémon\nwith its prize and continue on.",
    },
  }
};
